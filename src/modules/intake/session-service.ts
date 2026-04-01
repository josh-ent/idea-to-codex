import { randomUUID, createHash } from "node:crypto";

import { zodTextFormat } from "openai/helpers/zod";

import { createLogger, initializeLogging, logOperation } from "../../runtime/logging.js";
import {
  getPersistenceDatabase,
} from "../../runtime/persistence.js";
import { parseStructuredTextWithOpenAI } from "../llm/openai.js";
import { IntakeError } from "./errors.js";
import { loadIntakeSessionPromptAssets, renderIntakeSessionPrompt } from "./session-prompt-assets.js";
import {
  intakeBriefEntryTypes,
  intakeQuestionTags,
  intakeSessionOutputSchema,
  intakeSessionOutputResponseFormatName,
  type AuthoritativeProvenanceEntry,
  type IntakeBriefEntry,
  type IntakeBriefEntryRecord,
  type IntakeBriefVersion,
  type IntakeQuestion,
  type IntakeQuestionRecord,
  type IntakeQuestionImportance,
  type IntakeQuestionLineage,
  type IntakeQuestionStatus,
  type IntakeQuestionTag,
  type IntakeScope,
  type IntakeSession,
  type IntakeSessionDetail,
  type IntakeSessionModelOutput,
  type IntakeSessionPayload,
  type IntakeSessionQuestionDirective,
  type IntakeQuestionVersionRecord,
  type IntakeTurn,
  type ProvenanceEntryRecord,
  type StructuredSessionTurnUsage,
} from "./session-contract.js";
import { resolveIntakeScope } from "./scope.js";

const logger = createLogger("intake.sessions");
const intakeLane = "broad_reasoning" as const;
const defaultConfiguredModel =
  process.env.OPENAI_INTAKE_MODEL ??
  process.env.OPENAI_BROAD_REASONING_MODEL ??
  "gpt-5.2-chat-latest";
const defaultTimeoutMs = 60_000;

export interface IntakeSessionClient {
  generate(input: {
    configuredModel: string;
    lane: string;
    metadata: Record<string, unknown>;
    prompt: string;
    projectRoot: string;
    timeoutMs: number;
  }): Promise<{
    output: IntakeSessionModelOutput;
    resolvedModel: string | null;
    provider: string | null;
    request_log_event_id: number | null;
    response_log_event_id: number | null;
    usage: StructuredSessionTurnUsage | null;
  }>;
}

export interface IntakeSessionOptions {
  client?: IntakeSessionClient;
  configuredModel?: string;
  reservedBriefVersionId?: string;
  reservedTurnId?: string;
  stateDir?: string;
  timeoutMs?: number;
}

interface HostedTurnResult {
  configured_model: string;
  lane: string;
  output: IntakeSessionModelOutput;
  provider: string | null;
  request_log_event_id: number | null;
  resolved_model: string | null;
  response_log_event_id: number | null;
  usage: StructuredSessionTurnUsage | null;
}

export async function startIntakeSession(
  rootDir: string,
  requestText: string,
  options: IntakeSessionOptions = {},
): Promise<IntakeSessionPayload> {
  return logOperation(
    logger,
    "start intake session",
    async () => {
      if (!requestText.trim()) {
        throw new IntakeError("contract_violation", "Enter a request before starting intake.");
      }

      const scope = await resolveIntakeScope(rootDir);
      const db = openPersistence(options);
      const existing = readActiveSessionByScope(db, scope.scope_key);

      if (existing) {
        throw new IntakeError(
          "active_intake_session_exists",
          "An active intake session already exists for this project scope.",
          {
            details: {
              session_id: existing.id,
              scope_key: scope.scope_key,
            },
            retryable: false,
          },
        );
      }

      const session = insertSession(db, scope);
      const client = options.client ?? createDefaultClient();
      const turnId = randomUUID();
      const briefVersionId = randomUUID();
      const requestPayload = {
        request_text: requestText,
        operator_inputs: {},
      };
      let generated: HostedTurnResult | null = null;

      try {
        generated = await runHostedTurn(
          client,
          scope,
          requestText,
          "initial",
          session,
          [],
          [],
          {},
          {
            ...options,
            reservedBriefVersionId: briefVersionId,
            reservedTurnId: turnId,
          },
          turnId,
          briefVersionId,
        );
        const detail = applyTurnResult(db, {
          briefVersionId,
          session,
          expectedSessionRevision: session.session_revision,
          hostedTurn: generated,
          nextSessionStatus: "active",
          questionAnswers: {},
          turnKind: "initial",
          turnId,
          requestPayload,
        });

        logger.info("intake session started", {
          branch_name: detail.session.branch_name,
          scope_key: detail.session.scope_key,
          session_id: detail.session.id,
          session_revision: detail.session.session_revision,
          worktree_id: detail.session.worktree_id,
        });

        return {
          ...detail,
          session_revision: detail.session.session_revision,
        };
      } catch (error) {
        cleanupFailedInitialSession(db, session, requestPayload, turnId, generated);
        throw error;
      }
    },
    {
      fields: {
        request_length: requestText.trim().length,
        root_dir: rootDir,
      },
    },
  );
}

export async function getActiveIntakeSession(
  rootDir: string,
  options: IntakeSessionOptions = {},
): Promise<IntakeSessionPayload | null> {
  const scope = await resolveIntakeScope(rootDir);
  const db = openPersistence(options);
  const session = readActiveSessionByScope(db, scope.scope_key);

  if (!session) {
    return null;
  }

  const detail = readSessionDetail(db, session.id);

  if (!detail) {
    return null;
  }

  return {
    ...detail,
    session_revision: detail.session.session_revision,
  };
}

export async function getIntakeSession(
  rootDir: string,
  sessionId: string,
  options: IntakeSessionOptions = {},
): Promise<IntakeSessionPayload> {
  const scope = await resolveIntakeScope(rootDir);
  const db = openPersistence(options);
  const detail = requireScopedSessionDetail(db, scope, sessionId);

  return {
    ...detail,
    session_revision: detail.session.session_revision,
  };
}

export async function continueIntakeSession(
  rootDir: string,
  sessionId: string,
  expectedSessionRevision: number,
  questionAnswers: Record<string, string>,
  operatorNotes: string,
  options: IntakeSessionOptions = {},
): Promise<IntakeSessionPayload> {
  return runContinuation("continue", rootDir, sessionId, expectedSessionRevision, questionAnswers, operatorNotes, options);
}

export async function finalizeIntakeSession(
  rootDir: string,
  sessionId: string,
  expectedSessionRevision: number,
  finalizeNote: string,
  options: IntakeSessionOptions = {},
): Promise<IntakeSessionPayload> {
  return logOperation(
    logger,
    "finalize intake session",
    async () => {
      const scope = await resolveIntakeScope(rootDir);
      const db = openPersistence(options);
      const detail = requireScopedSessionDetail(db, scope, sessionId);

      if (!detail.current_brief) {
        throw new IntakeError(
          "contract_violation",
          "An intake session cannot be finalized before the initial brief exists.",
          { retryable: false },
        );
      }

      const activeSession = transitionSessionStatus(
        db,
        sessionId,
        expectedSessionRevision,
        "active",
        "finalizing",
      );
      const client = options.client ?? createDefaultClient();
      const turnId = randomUUID();
      const briefVersionId = randomUUID();
      const generated = await runHostedTurn(
        client,
        extractScopeFromSession(activeSession),
        finalizeNote || detail.current_brief_entries.map((entry) => entry.rendered_markdown).join("\n"),
        "finalize",
        activeSession,
        detail.current_brief_entries,
        detail.questions,
        {
          answers: questionAnswersFromCurrentQuestions(detail.questions),
          note: finalizeNote,
        },
        {
          ...options,
          reservedBriefVersionId: briefVersionId,
          reservedTurnId: turnId,
        },
        turnId,
        briefVersionId,
      );

      const finalized = applyTurnResult(db, {
        briefVersionId,
        session: activeSession,
        expectedSessionRevision: activeSession.session_revision,
        hostedTurn: generated,
        nextSessionStatus: "finalized",
        questionAnswers: questionAnswersFromCurrentQuestions(detail.questions),
        turnKind: "finalize",
        turnId,
        requestPayload: {
          request_text: finalizeNote,
          operator_inputs: {
            answers: questionAnswersFromCurrentQuestions(detail.questions),
            note: finalizeNote,
          },
        },
      });

      return {
        ...finalized,
        session_revision: finalized.session.session_revision,
      };
    },
    {
      fields: {
        expected_session_revision: expectedSessionRevision,
        root_dir: rootDir,
        session_id: sessionId,
      },
      errorLevel: "warn",
      summarizeResult: (payload) => ({
        brief_version_id: payload.current_brief?.id ?? null,
        session_revision: payload.session_revision,
        status: payload.session.status,
      }),
    },
  ).catch(async (error) => {
    const db = openPersistence(options);
    const session = readSessionById(db, sessionId);

    if (session?.status === "finalizing") {
      try {
        transitionSessionStatus(
          db,
          sessionId,
          session.session_revision,
          "finalizing",
          "active",
        );
      } catch {
        // keep original failure
      }
    }

    throw error;
  });
}

export async function abandonIntakeSession(
  rootDir: string,
  sessionId: string,
  expectedSessionRevision: number,
  options: IntakeSessionOptions = {},
): Promise<IntakeSessionPayload> {
  const scope = await resolveIntakeScope(rootDir);
  const db = openPersistence(options);
  requireScopedSessionDetail(db, scope, sessionId);
  transitionSessionStatus(db, sessionId, expectedSessionRevision, "active", "abandoned");
  const detail = requireScopedSessionDetail(db, scope, sessionId);

  return {
    ...detail,
    session_revision: detail.session.session_revision,
  };
}

function questionAnswersFromCurrentQuestions(questions: IntakeQuestion[]): Record<string, string> {
  return Object.fromEntries(
    questions
      .filter((question) => typeof question.answer_text === "string" && question.answer_text.trim())
      .map((question) => [question.id, question.answer_text!.trim()]),
  );
}

async function runContinuation(
  turnKind: "continue",
  rootDir: string,
  sessionId: string,
  expectedSessionRevision: number,
  questionAnswers: Record<string, string>,
  operatorNotes: string,
  options: IntakeSessionOptions,
): Promise<IntakeSessionPayload> {
  return logOperation(
    logger,
    "continue intake session",
    async () => {
      const scope = await resolveIntakeScope(rootDir);
      const db = openPersistence(options);
      const detail = requireScopedSessionDetail(db, scope, sessionId);

      if (detail.session.status !== "active") {
        throw new IntakeError(
          "intake_session_not_active",
          "Only active intake sessions can continue.",
          { retryable: false },
        );
      }

      if (detail.session.session_revision !== expectedSessionRevision) {
        throw new IntakeError(
          "intake_session_revision_conflict",
          "The intake session changed in another window. Reload before continuing.",
          {
            details: {
              expected_revision: expectedSessionRevision,
              current_revision: detail.session.session_revision,
            },
            retryable: false,
          },
        );
      }

      const currentQuestions = detail.questions.map((question) => ({
        ...question,
        answer_text: questionAnswers[question.id] ?? question.answer_text,
      }));
      const client = options.client ?? createDefaultClient();
      const turnId = randomUUID();
      const briefVersionId = randomUUID();
      const generated = await runHostedTurn(
        client,
        extractScopeFromSession(detail.session),
        operatorNotes || detail.current_brief_entries.map((entry) => entry.rendered_markdown).join("\n"),
        turnKind,
        detail.session,
        detail.current_brief_entries,
        currentQuestions,
        {
          answers: questionAnswers,
          note: operatorNotes,
        },
        {
          ...options,
          reservedBriefVersionId: briefVersionId,
          reservedTurnId: turnId,
        },
        turnId,
        briefVersionId,
      );
      const updated = applyTurnResult(db, {
        briefVersionId,
        session: detail.session,
        expectedSessionRevision,
        hostedTurn: generated,
        nextSessionStatus: "active",
        questionAnswers,
        turnKind,
        turnId,
        requestPayload: {
          request_text: operatorNotes,
          operator_inputs: {
            answers: questionAnswers,
            note: operatorNotes,
          },
        },
      });

      return {
        ...updated,
        session_revision: updated.session.session_revision,
      };
    },
    {
      fields: {
        expected_session_revision: expectedSessionRevision,
        question_answer_count: Object.keys(questionAnswers).length,
        root_dir: rootDir,
        session_id: sessionId,
      },
      errorLevel: "warn",
    },
  );
}

function createDefaultClient(): IntakeSessionClient {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new IntakeError(
      "llm_not_configured",
      "OpenAI intake is not configured. Set OPENAI_API_KEY before running intake.",
    );
  }

  return {
    async generate(input) {
      const assets = await loadIntakeSessionPromptAssets();
      const response = await parseStructuredTextWithOpenAI<IntakeSessionModelOutput>({
        apiKey,
        canonicalProjectRoot: input.projectRoot,
        configuredModel: input.configuredModel,
        instructions: assets.system_instructions,
        lane: input.lane,
        metadata: input.metadata,
        prompt: input.prompt,
        responseFormat: zodTextFormat(
          intakeSessionOutputSchema,
          intakeSessionOutputResponseFormatName,
        ),
        timeoutMs: input.timeoutMs,
      });

      if (!response.parsed) {
        throw new IntakeError(
          "model_refusal",
          response.refusal?.trim() || "The intake model refused to continue this intake session.",
        );
      }

      return {
        output: response.parsed,
        provider: "openai",
        request_log_event_id: response.requestLogEventId,
        resolvedModel: response.resolvedModel,
        response_log_event_id: response.responseLogEventId,
        usage: response.usage,
      };
    },
  };
}

async function runHostedTurn(
  client: IntakeSessionClient,
  scope: IntakeScope,
  requestText: string,
  turnKind: "initial" | "continue" | "finalize",
  session: IntakeSession,
  currentBriefEntries: IntakeBriefEntry[],
  currentQuestions: IntakeQuestion[],
  operatorInputs: Record<string, unknown>,
  options: IntakeSessionOptions = {},
  turnId?: string,
  resultBriefVersionId?: string,
): Promise<HostedTurnResult> {
  const assets = await loadIntakeSessionPromptAssets();
  const configuredModel = options.configuredModel?.trim() || defaultConfiguredModel;

  const generated = await client.generate({
    configuredModel,
    lane: intakeLane,
    metadata: {
      base_brief_version_id: session.current_brief_version_id,
      brief_version_id: resultBriefVersionId ?? null,
      operation_owner: "intake_session",
      project_root: scope.project_root,
      session_id: session.id,
      turn_id: turnId ?? null,
      turn_kind: turnKind,
    },
    projectRoot: scope.project_root,
    prompt: renderIntakeSessionPrompt({
      branch_name: scope.branch_name,
      current_brief_entries_json: JSON.stringify(
        currentBriefEntries.map((entry) => ({
          entry_type: entry.entry_type,
          value: JSON.parse(entry.value_json),
        })),
        null,
        2,
      ),
      current_questions_json: JSON.stringify(
        currentQuestions.map((question) => ({
          answer_text: question.answer_text,
          display_id: question.display_id,
          id: question.id,
          importance: question.importance,
          prompt: question.current_prompt,
          rationale_markdown: question.current_rationale_markdown,
          status: question.status,
          tags: question.tags,
        })),
        null,
        2,
      ),
      operator_inputs_json: JSON.stringify(operatorInputs, null, 2),
      project_root: scope.project_root,
      request_text: requestText,
      scope_fallback_mode: scope.scope_fallback_mode,
      template: assets.user_template,
      turn_kind: turnKind,
      worktree_id: scope.worktree_id,
    }),
    timeoutMs: normalizeTimeoutMs(options.timeoutMs),
  });

  return {
    configured_model: configuredModel,
    lane: intakeLane,
    output: generated.output,
    provider: generated.provider,
    request_log_event_id: generated.request_log_event_id,
    resolved_model: generated.resolvedModel,
    response_log_event_id: generated.response_log_event_id,
    usage: generated.usage,
  };
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }

  const configured = Number.parseInt(process.env.OPENAI_RESPONSES_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultTimeoutMs;
}

function insertSession(db: ReturnType<typeof getPersistenceDatabase>, scope: IntakeScope): IntakeSession {
  const now = new Date().toISOString();
  const session: IntakeSession = {
    id: randomUUID(),
    scope_key: scope.scope_key,
    project_root: scope.project_root,
    branch_name: scope.branch_name,
    worktree_id: scope.worktree_id,
    scope_fallback_mode: scope.scope_fallback_mode,
    status: "active",
    current_brief_version_id: null,
    session_revision: 1,
    created_at: now,
    updated_at: now,
    finalized_at: null,
    abandoned_at: null,
  };

  db.prepare(
    [
      "INSERT INTO intake_sessions (",
      "  id, scope_key, project_root, branch_name, worktree_id, scope_fallback_mode, status,",
      "  current_brief_version_id, session_revision, created_at, updated_at, finalized_at, abandoned_at",
      ") VALUES (",
      "  @id, @scope_key, @project_root, @branch_name, @worktree_id, @scope_fallback_mode, @status,",
      "  @current_brief_version_id, @session_revision, @created_at, @updated_at, @finalized_at, @abandoned_at",
      ")",
    ].join("\n"),
  ).run(session);

  return session;
}

function readActiveSessionByScope(
  db: ReturnType<typeof getPersistenceDatabase>,
  scopeKey: string,
): IntakeSession | null {
  return readSessionRow(
    db.prepare(
      [
        "SELECT *",
        "FROM intake_sessions",
        "WHERE scope_key = ? AND status IN ('active', 'finalizing')",
        "LIMIT 1",
      ].join("\n"),
    ).get(scopeKey),
  );
}

function readSessionById(
  db: ReturnType<typeof getPersistenceDatabase>,
  sessionId: string,
): IntakeSession | null {
  return readSessionRow(
    db.prepare("SELECT * FROM intake_sessions WHERE id = ? LIMIT 1").get(sessionId),
  );
}

function requireSessionDetail(
  db: ReturnType<typeof getPersistenceDatabase>,
  sessionId: string,
): IntakeSessionDetail {
  const detail = readSessionDetail(db, sessionId);

  if (!detail) {
    throw new IntakeError("intake_session_not_found", `Unknown intake session: ${sessionId}`, {
      retryable: false,
    });
  }

  return detail;
}

function requireScopedSessionDetail(
  db: ReturnType<typeof getPersistenceDatabase>,
  scope: IntakeScope,
  sessionId: string,
): IntakeSessionDetail {
  const detail = requireSessionDetail(db, sessionId);

  if (detail.session.scope_key !== scope.scope_key) {
    throw new IntakeError("intake_session_not_found", `Unknown intake session: ${sessionId}`, {
      retryable: false,
    });
  }

  return detail;
}

function readSessionDetail(
  db: ReturnType<typeof getPersistenceDatabase>,
  sessionId: string,
): IntakeSessionDetail | null {
  const session = readSessionById(db, sessionId);

  if (!session) {
    return null;
  }

  const current_brief = session.current_brief_version_id
    ? readBriefVersionRow(
        db.prepare("SELECT * FROM intake_brief_versions WHERE id = ?").get(session.current_brief_version_id),
      )
    : null;
  const current_brief_entries = current_brief ? readBriefEntriesForVersion(db, current_brief.id) : [];
  const questions = readQuestionsForSession(db, sessionId);
  const question_lineage_summary = db
    .prepare(
      "SELECT * FROM intake_question_lineage WHERE session_id = ? ORDER BY rowid ASC",
    )
    .all(sessionId)
    .map((row) => row as IntakeQuestionLineage);
  const initialTurn = db
    .prepare(
      [
        "SELECT request_payload_json",
        "FROM intake_turns",
        "WHERE session_id = ? AND turn_kind = 'initial'",
        "ORDER BY turn_number ASC",
        "LIMIT 1",
      ].join("\n"),
    )
    .get(sessionId) as { request_payload_json: string } | undefined;
  const request_text = readRequestText(initialTurn?.request_payload_json);

  return {
    session,
    request_text,
    current_brief,
    current_brief_entries,
    questions,
    question_lineage_summary,
  };
}

function applyTurnResult(
  db: ReturnType<typeof getPersistenceDatabase>,
  input: {
    briefVersionId: string;
    session: IntakeSession;
    expectedSessionRevision: number;
    hostedTurn: HostedTurnResult;
    nextSessionStatus: "active" | "finalized";
    questionAnswers: Record<string, string>;
    turnKind: "initial" | "continue" | "finalize";
    turnId: string;
    requestPayload: Record<string, unknown>;
  },
): IntakeSessionDetail {
  const apply = db.transaction(() => {
    const session = readSessionById(db, input.session.id);

    if (!session) {
      throw new IntakeError("intake_session_not_found", `Unknown intake session: ${input.session.id}`, {
        retryable: false,
      });
    }

    if (session.session_revision !== input.expectedSessionRevision) {
      throw new IntakeError(
        "intake_session_revision_conflict",
        "The intake session changed in another window. Reload before continuing.",
        {
          details: {
            expected_revision: input.expectedSessionRevision,
            current_revision: session.session_revision,
          },
          retryable: false,
        },
      );
    }

    const now = new Date().toISOString();
    const nextRevision = session.session_revision + 1;
    const turnNumber =
      Number(
        (
          db.prepare("SELECT MAX(turn_number) AS value FROM intake_turns WHERE session_id = ?").get(
            session.id,
          ) as { value: number | null }
        ).value ?? 0,
      ) + 1;
    const briefVersionNumber =
      Number(
        (
          db.prepare(
            "SELECT MAX(brief_version_number) AS value FROM intake_brief_versions WHERE session_id = ?",
          ).get(session.id) as { value: number | null }
        ).value ?? 0,
      ) + 1;
    const currentQuestions = db
      .prepare("SELECT * FROM intake_questions WHERE session_id = ? ORDER BY current_display_order ASC")
      .all(session.id)
      .map(readQuestionRecordRow);
    const reconciled = reconcileQuestions(
      currentQuestions,
      input.hostedTurn.output.question_directives,
      input.questionAnswers,
      nextRevision,
      input.turnId,
      input.turnKind,
    );
    const renderedBrief = renderBriefMarkdown(input.hostedTurn.output);

    db.prepare(
      [
        "INSERT INTO intake_turns (",
        "  id, session_id, turn_number, turn_kind, base_brief_version_id, result_brief_version_id,",
        "  request_payload_json, llm_response_json, created_at, completed_at, status, provider, lane,",
        "  configured_model, resolved_model, input_tokens, output_tokens, total_tokens,",
        "  request_log_event_id, response_log_event_id, session_revision_before, session_revision_after,",
        "  question_reconciliation_summary_json",
        ") VALUES (",
        "  @id, @session_id, @turn_number, @turn_kind, @base_brief_version_id, @result_brief_version_id,",
        "  @request_payload_json, @llm_response_json, @created_at, @completed_at, @status, @provider, @lane,",
        "  @configured_model, @resolved_model, @input_tokens, @output_tokens, @total_tokens,",
        "  @request_log_event_id, @response_log_event_id, @session_revision_before, @session_revision_after,",
        "  @question_reconciliation_summary_json",
        ")",
      ].join("\n"),
    ).run({
      id: input.turnId,
      session_id: session.id,
      turn_number: turnNumber,
      turn_kind: input.turnKind,
      base_brief_version_id: session.current_brief_version_id,
      result_brief_version_id: input.briefVersionId,
      request_payload_json: JSON.stringify(input.requestPayload),
      llm_response_json: JSON.stringify(input.hostedTurn.output),
      created_at: now,
      completed_at: now,
      configured_model: input.hostedTurn.configured_model,
      input_tokens: input.hostedTurn.usage?.input_tokens ?? null,
      lane: input.hostedTurn.lane,
      output_tokens: input.hostedTurn.usage?.output_tokens ?? null,
      provider: input.hostedTurn.provider,
      question_reconciliation_summary_json: JSON.stringify(
        summarizeQuestionReconciliation(reconciled.lineage),
      ),
      request_log_event_id: input.hostedTurn.request_log_event_id,
      resolved_model: input.hostedTurn.resolved_model,
      response_log_event_id: input.hostedTurn.response_log_event_id,
      session_revision_after: nextRevision,
      session_revision_before: session.session_revision,
      status: "succeeded",
      total_tokens: input.hostedTurn.usage?.total_tokens ?? null,
    });

    db.prepare(
      [
        "INSERT INTO intake_brief_versions (",
        "  id, session_id, brief_version_number, created_from_turn_id, status, rendered_markdown, created_at",
        ") VALUES (",
        "  @id, @session_id, @brief_version_number, @created_from_turn_id, @status, @rendered_markdown, @created_at",
        ")",
      ].join("\n"),
    ).run({
      id: input.briefVersionId,
      session_id: session.id,
      brief_version_number: briefVersionNumber,
      created_from_turn_id: input.turnId,
      status: input.nextSessionStatus === "finalized" ? "final" : "draft",
      rendered_markdown: renderedBrief,
      created_at: now,
    });

    let position = 0;
    for (const entry of toBriefEntries(input.hostedTurn.output)) {
      const entryId = randomUUID();
      db.prepare(
        [
          "INSERT INTO intake_brief_entries (",
          "  id, brief_version_id, entry_type, position, value_json, rendered_markdown, provenance_summary",
          ") VALUES (",
          "  @id, @brief_version_id, @entry_type, @position, @value_json, @rendered_markdown, @provenance_summary",
          ")",
        ].join("\n"),
      ).run({
        id: entryId,
        brief_version_id: input.briefVersionId,
        entry_type: entry.entry_type,
        position: position++,
        value_json: JSON.stringify({ text: entry.text }),
        rendered_markdown: entry.text,
        provenance_summary: `${entry.provenance_type}: ${entry.label}`,
      });
      insertProvenanceEntry(db, {
        created_at: now,
        detail: entry.detail,
        label: entry.label,
        owner_id: entryId,
        owner_kind: "brief_entry",
        provenance_type: entry.provenance_type,
        source_metadata: entry.source_metadata,
      });
    }

    for (const change of reconciled.previous_questions) {
      db.prepare(
        [
          "UPDATE intake_questions",
          "SET current_prompt = @current_prompt, current_rationale_markdown = @current_rationale_markdown,",
          "  importance = @importance, tags_json = @tags_json, status = @status, current_display_order = @current_display_order,",
          "  answer_text = @answer_text, answer_updated_at = @answer_updated_at,",
          "  superseded_by_question_id = @superseded_by_question_id, session_revision_seen = @session_revision_seen,",
          "  updated_at = @updated_at",
          "WHERE id = @id",
        ].join("\n"),
      ).run({
        answer_text: change.answer_text,
        answer_updated_at: change.answer_updated_at,
        current_display_order: change.current_display_order,
        current_prompt: change.current_prompt,
        current_rationale_markdown: change.current_rationale_markdown,
        id: change.id,
        importance: change.importance,
        session_revision_seen: nextRevision,
        status: change.status,
        superseded_by_question_id: change.superseded_by_question_id,
        tags_json: JSON.stringify(change.tags),
        updated_at: now,
      });
      insertQuestionVersion(db, change, session.id, input.turnId, now);
    }

    for (const createdQuestion of reconciled.created_questions) {
      db.prepare(
        [
          "INSERT INTO intake_questions (",
          "  id, display_id, session_id, origin_turn_id, current_prompt, current_rationale_markdown,",
          "  importance, tags_json, status, current_display_order, answer_text, answer_updated_at,",
          "  superseded_by_question_id, session_revision_seen, updated_at",
          ") VALUES (",
          "  @id, @display_id, @session_id, @origin_turn_id, @current_prompt, @current_rationale_markdown,",
          "  @importance, @tags_json, @status, @current_display_order, @answer_text, @answer_updated_at,",
          "  @superseded_by_question_id, @session_revision_seen, @updated_at",
          ")",
        ].join("\n"),
      ).run({
        answer_text: createdQuestion.answer_text,
        answer_updated_at: createdQuestion.answer_updated_at,
        current_display_order: createdQuestion.current_display_order,
        current_prompt: createdQuestion.current_prompt,
        current_rationale_markdown: createdQuestion.current_rationale_markdown,
        display_id: createdQuestion.display_id,
        id: createdQuestion.id,
        importance: createdQuestion.importance,
        origin_turn_id: input.turnId,
        session_id: session.id,
        session_revision_seen: nextRevision,
        status: createdQuestion.status,
        superseded_by_question_id: createdQuestion.superseded_by_question_id,
        tags_json: JSON.stringify(createdQuestion.tags),
        updated_at: now,
      });
      insertQuestionVersion(db, createdQuestion, session.id, input.turnId, now);
    }

    for (const lineage of reconciled.lineage) {
      db.prepare(
        [
          "INSERT INTO intake_question_lineage (",
          "  id, session_id, turn_id, from_question_id, to_question_id, relation_type",
          ") VALUES (",
          "  @id, @session_id, @turn_id, @from_question_id, @to_question_id, @relation_type",
          ")",
        ].join("\n"),
      ).run({
        id: randomUUID(),
        session_id: session.id,
        turn_id: input.turnId,
        from_question_id: lineage.from_question_id,
        to_question_id: lineage.to_question_id,
        relation_type: lineage.relation_type,
      });
    }

    db.prepare(
      [
        "UPDATE intake_sessions",
        "SET status = @status, current_brief_version_id = @current_brief_version_id,",
        "  session_revision = @session_revision, updated_at = @updated_at, finalized_at = @finalized_at",
        "WHERE id = @id",
      ].join("\n"),
    ).run({
      finalized_at: input.nextSessionStatus === "finalized" ? now : session.finalized_at,
      current_brief_version_id: input.briefVersionId,
      id: session.id,
      session_revision: nextRevision,
      status: input.nextSessionStatus,
      updated_at: now,
    });

    return requireSessionDetail(db, session.id);
  });

  return apply();
}

function reconcileQuestions(
  currentQuestions: Array<IntakeQuestion | IntakeQuestionRecord>,
  directives: IntakeSessionQuestionDirective[],
  questionAnswers: Record<string, string>,
  nextRevision: number,
  turnId: string,
  turnKind: "initial" | "continue" | "finalize",
): {
  previous_questions: IntakeQuestionRecord[];
  created_questions: IntakeQuestionRecord[];
  lineage: IntakeQuestionLineage[];
} {
  const liveQuestions = currentQuestions.filter(isLiveQuestion);
  const currentById = new Map(liveQuestions.map((question) => [question.id, question]));
  const touchedQuestionIds = new Set<string>();
  const previous_questions: IntakeQuestionRecord[] = [];
  const created_questions: IntakeQuestionRecord[] = [];
  const lineage: IntakeQuestionLineage[] = [];
  let displayOrder = 1;

  for (const rawDirective of directives) {
    const directive = normalizeDirective(rawDirective);

    if (directive.existing_question_id) {
      if (touchedQuestionIds.has(directive.existing_question_id)) {
        throw new IntakeError(
          "intake_question_mapping_invalid",
          `Question ${directive.existing_question_id} received duplicate reconciliation directives.`,
          { retryable: false },
        );
      }

      touchedQuestionIds.add(directive.existing_question_id);
    }

    if (directive.action === "create_new") {
      if (!directive.prompt || !directive.rationale_markdown || !directive.importance) {
        throw new IntakeError(
          "intake_question_mapping_invalid",
          "New intake questions require prompt, rationale, and importance.",
          { retryable: false },
        );
      }

      created_questions.push(createQuestion(turnId, displayOrder++, directive, null));
      continue;
    }

    const existing = directive.existing_question_id
      ? currentById.get(directive.existing_question_id)
      : null;

    if (!existing) {
      throw new IntakeError(
        "intake_question_mapping_invalid",
        `Unknown intake question mapping target: ${directive.existing_question_id ?? "(missing id)"}.`,
        { retryable: false },
      );
    }

    if (directive.action === "retain_existing") {
      const answerText = questionAnswers[existing.id] ?? existing.answer_text;
      previous_questions.push({
        ...existing,
        answer_text: answerText,
        answer_updated_at: answerText?.trim() ? new Date().toISOString() : null,
        current_display_order: displayOrder++,
        current_prompt: directive.prompt?.trim() || existing.current_prompt,
        current_rationale_markdown:
          directive.rationale_markdown?.trim() || existing.current_rationale_markdown,
        importance: directive.importance ?? existing.importance,
        status: answerText?.trim() ? "answered" : "open",
        tags: directive.tags.length > 0 ? directive.tags : existing.tags,
        updated_at: new Date().toISOString(),
      });
      lineage.push({
        id: randomUUID(),
        session_id: existing.session_id,
        turn_id: turnId,
        from_question_id: existing.id,
        to_question_id: existing.id,
        relation_type: "retained_as",
      });
      continue;
    }

    if (directive.action === "satisfied_no_longer_needed") {
      previous_questions.push({
        ...existing,
        current_display_order: existing.current_display_order,
        status: "satisfied",
        updated_at: new Date().toISOString(),
      });
      lineage.push({
        id: randomUUID(),
        session_id: existing.session_id,
        turn_id: turnId,
        from_question_id: existing.id,
        to_question_id: null,
        relation_type: "satisfied_by_turn",
      });
      continue;
    }

    if (!directive.prompt || !directive.rationale_markdown || !directive.importance) {
      throw new IntakeError(
        "intake_question_mapping_invalid",
        "Superseding a question requires new prompt, rationale, and importance.",
        { retryable: false },
      );
    }

    const replacement = createQuestion(turnId, displayOrder++, directive, existing.answer_text);
    previous_questions.push({
      ...existing,
      status: "superseded",
      superseded_by_question_id: replacement.id,
      updated_at: new Date().toISOString(),
    });
    created_questions.push(replacement);
    lineage.push({
      id: randomUUID(),
      session_id: existing.session_id,
      turn_id: turnId,
      from_question_id: existing.id,
      to_question_id: replacement.id,
      relation_type: "superseded_by",
    });
  }

  const omittedQuestions = liveQuestions.filter((question) => !touchedQuestionIds.has(question.id));

  if (turnKind === "continue" && omittedQuestions.length > 0) {
    throw new IntakeError(
      "intake_question_mapping_invalid",
      `Every live intake question must receive exactly one directive on continue. Missing: ${omittedQuestions
        .map((question) => question.id)
        .join(", ")}`,
      { retryable: false },
    );
  }

  for (const question of omittedQuestions) {
    if (
      turnKind === "finalize"
      && question.status === "open"
      && !question.answer_text?.trim()
      && !questionAnswers[question.id]?.trim()
    ) {
      previous_questions.push({
        ...question,
        status: "accepted_without_answer",
        updated_at: new Date().toISOString(),
      });
      lineage.push({
        id: randomUUID(),
        session_id: question.session_id,
        turn_id: turnId,
        from_question_id: question.id,
        to_question_id: null,
        relation_type: "accepted_without_answer_at_finalize",
      });
      continue;
    }

    throw new IntakeError(
      "intake_question_mapping_invalid",
      `Every live intake question must receive exactly one directive on ${turnKind}. Missing: ${question.id}`,
      { retryable: false },
    );
  }

  for (const question of currentQuestions.filter((entry) => !isLiveQuestion(entry))) {
    previous_questions.push({
      ...question,
    });
  }

  for (const question of [...previous_questions, ...created_questions]) {
    question.session_revision_seen = nextRevision;
  }

  return {
    previous_questions,
    created_questions,
    lineage,
  };
}

function createQuestion(
  turnId: string,
  displayOrder: number,
  directive: ReturnType<typeof normalizeDirective>,
  answerText: string | null,
): IntakeQuestionRecord {
  return {
    id: randomUUID(),
    display_id: nextQuestionDisplayId(),
    session_id: "",
    origin_turn_id: turnId,
    current_prompt: directive.prompt!,
    current_rationale_markdown: directive.rationale_markdown!,
    importance: directive.importance!,
    tags: directive.tags,
    status: answerText?.trim() ? "answered" : "open",
    current_display_order: displayOrder,
    answer_text: answerText,
    answer_updated_at: answerText?.trim() ? new Date().toISOString() : null,
    superseded_by_question_id: null,
    session_revision_seen: 0,
    updated_at: new Date().toISOString(),
  };
}

function normalizeDirective(
  directive: IntakeSessionQuestionDirective,
): IntakeSessionQuestionDirective {
  return {
    action: directive.action,
    existing_question_id: directive.existing_question_id?.trim(),
    importance: directive.importance,
    prompt: directive.prompt?.trim(),
    rationale_markdown: directive.rationale_markdown?.trim(),
    tags: [...new Set((directive.tags ?? []).filter(isIntakeQuestionTag))].sort(),
  };
}

function insertQuestionVersion(
  db: ReturnType<typeof getPersistenceDatabase>,
  question: IntakeQuestionRecord,
  sessionId: string,
  turnId: string,
  createdAt: string,
): void {
  const versionNumber =
    Number(
      (
        db.prepare(
          "SELECT MAX(version_number) AS value FROM intake_question_versions WHERE question_id = ?",
        ).get(question.id) as { value: number | null }
      ).value ?? 0,
    ) + 1;
  const versionId = randomUUID();

  db.prepare(
    [
      "INSERT INTO intake_question_versions (",
      "  id, question_id, session_id, turn_id, version_number, prompt, rationale_markdown,",
      "  display_id, importance, tags_json, status, display_order, answer_text, created_at",
      ") VALUES (",
      "  @id, @question_id, @session_id, @turn_id, @version_number, @prompt, @rationale_markdown,",
      "  @display_id, @importance, @tags_json, @status, @display_order, @answer_text, @created_at",
      ")",
    ].join("\n"),
  ).run({
    answer_text: question.answer_text,
    created_at: createdAt,
    display_id: question.display_id,
    display_order: question.current_display_order,
    id: versionId,
    importance: question.importance,
    prompt: question.current_prompt,
    question_id: question.id,
    rationale_markdown: question.current_rationale_markdown,
    session_id: sessionId,
    status: question.status,
    tags_json: JSON.stringify(question.tags),
    turn_id: turnId,
    version_number: versionNumber,
  });

  insertProvenanceEntry(db, {
    created_at: createdAt,
    detail: {
      prompt: question.current_prompt,
      tags: question.tags,
    },
    label: "Question synthesized during intake",
    owner_id: versionId,
    owner_kind: "question_version",
    provenance_type: "llm_inferred",
    source_metadata: {},
  });
}

function insertProvenanceEntry(
  db: ReturnType<typeof getPersistenceDatabase>,
  input: {
    created_at: string;
    detail: Record<string, unknown>;
    label: string;
    owner_id: string;
    owner_kind: ProvenanceEntryRecord["owner_kind"];
    provenance_type: ProvenanceEntryRecord["provenance_type"];
    source_metadata: Record<string, unknown>;
  },
): void {
  db.prepare(
    [
      "INSERT INTO provenance_entries (",
      "  id, owner_kind, owner_id, provenance_type, label, detail_json, source_metadata_json, created_at",
      ") VALUES (",
      "  @id, @owner_kind, @owner_id, @provenance_type, @label, @detail_json, @source_metadata_json, @created_at",
      ")",
    ].join("\n"),
  ).run({
    created_at: input.created_at,
    detail_json: JSON.stringify(input.detail),
    id: randomUUID(),
    label: input.label,
    owner_id: input.owner_id,
    owner_kind: input.owner_kind,
    provenance_type: input.provenance_type,
    source_metadata_json: JSON.stringify(input.source_metadata),
  });
}

function renderBriefMarkdown(output: IntakeSessionModelOutput): string {
  return toBriefEntries(output)
    .map((entry) => `## ${entry.entry_type}\n\n${entry.text}`)
    .join("\n\n");
}

function toBriefEntries(output: IntakeSessionModelOutput) {
  return intakeBriefEntryTypes.flatMap((entryType) =>
    output[entryType].map((item) => ({
      detail: item.detail,
      entry_type: entryType,
      label: item.label,
      provenance_type: item.provenance_type,
      source_metadata: item.source_metadata,
      text: item.text.trim(),
    })),
  ).filter((entry) => entry.text);
}

function transitionSessionStatus(
  db: ReturnType<typeof getPersistenceDatabase>,
  sessionId: string,
  expectedRevision: number,
  fromStatus: IntakeSession["status"],
  toStatus: IntakeSession["status"],
): IntakeSession {
  const session = readSessionById(db, sessionId);

  if (!session) {
    throw new IntakeError("intake_session_not_found", `Unknown intake session: ${sessionId}`, {
      retryable: false,
    });
  }

  if (session.session_revision !== expectedRevision) {
    throw new IntakeError(
      "intake_session_revision_conflict",
      "The intake session changed in another window. Reload before continuing.",
      {
        details: {
          expected_revision: expectedRevision,
          current_revision: session.session_revision,
        },
        retryable: false,
      },
    );
  }

  if (session.status !== fromStatus) {
    throw new IntakeError(
      "intake_session_not_active",
      `Expected intake session status ${fromStatus}, found ${session.status}.`,
      { retryable: false },
    );
  }

  const now = new Date().toISOString();
  const next: IntakeSession = {
    ...session,
    status: toStatus,
    session_revision: session.session_revision + 1,
    updated_at: now,
    finalized_at: toStatus === "finalized" ? now : session.finalized_at,
    abandoned_at: toStatus === "abandoned" ? now : session.abandoned_at,
  };

  db.prepare(
    [
      "UPDATE intake_sessions",
      "SET status = @status, session_revision = @session_revision, updated_at = @updated_at,",
      "  finalized_at = @finalized_at, abandoned_at = @abandoned_at",
      "WHERE id = @id",
    ].join("\n"),
  ).run(next);

  return next;
}

function extractScopeFromSession(session: IntakeSession): IntakeScope {
  return {
    scope_key: session.scope_key,
    project_root: session.project_root,
    branch_name: session.branch_name,
    worktree_id: session.worktree_id,
    scope_fallback_mode: session.scope_fallback_mode,
  };
}

function readSessionRow(row: unknown): IntakeSession | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const value = row as Record<string, unknown>;

  return {
    abandoned_at: readNullableString(value.abandoned_at),
    branch_name: readNullableString(value.branch_name),
    created_at: readString(value.created_at),
    current_brief_version_id: readNullableString(value.current_brief_version_id),
    finalized_at: readNullableString(value.finalized_at),
    id: readString(value.id),
    project_root: readString(value.project_root),
    scope_fallback_mode: readString(value.scope_fallback_mode) as IntakeSession["scope_fallback_mode"],
    scope_key: readString(value.scope_key),
    session_revision: Number(value.session_revision),
    status: readString(value.status) as IntakeSession["status"],
    updated_at: readString(value.updated_at),
    worktree_id: readNullableString(value.worktree_id),
  };
}

function readBriefVersionRow(row: unknown): IntakeBriefVersion | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const value = row as Record<string, unknown>;

  return {
    brief_version_number: Number(value.brief_version_number),
    created_at: readString(value.created_at),
    created_from_turn_id: readString(value.created_from_turn_id),
    id: readString(value.id),
    rendered_markdown: readString(value.rendered_markdown),
    session_id: readString(value.session_id),
    status: readString(value.status) as IntakeBriefVersion["status"],
  };
}

function readBriefEntriesForVersion(
  db: ReturnType<typeof getPersistenceDatabase>,
  briefVersionId: string,
): IntakeBriefEntry[] {
  const records = db
    .prepare(
      "SELECT * FROM intake_brief_entries WHERE brief_version_id = ? ORDER BY position ASC, id ASC",
    )
    .all(briefVersionId)
    .map(readBriefEntryRow);

  return records.map((record) => ({
    ...record,
    provenance_entries: readAuthoritativeProvenanceEntries(db, "brief_entry", record.id),
  }));
}

function readBriefEntryRow(row: unknown): IntakeBriefEntryRecord {
  const value = row as Record<string, unknown>;

  return {
    brief_version_id: readString(value.brief_version_id),
    entry_type: readString(value.entry_type) as IntakeBriefEntryRecord["entry_type"],
    id: readString(value.id),
    position: Number(value.position),
    provenance_summary: readNullableString(value.provenance_summary),
    rendered_markdown: readString(value.rendered_markdown),
    value_json: readString(value.value_json),
  };
}

function readQuestionsForSession(
  db: ReturnType<typeof getPersistenceDatabase>,
  sessionId: string,
): IntakeQuestion[] {
  const records = db
    .prepare(
      "SELECT * FROM intake_questions WHERE session_id = ? ORDER BY current_display_order ASC, updated_at ASC",
    )
    .all(sessionId)
    .map(readQuestionRecordRow);

  return records.map((record) => ({
    ...record,
    provenance_entries: readQuestionProvenanceEntries(db, record.id),
  }));
}

function readQuestionRecordRow(row: unknown): IntakeQuestionRecord {
  const value = row as Record<string, unknown>;

  return {
    answer_text: readNullableString(value.answer_text),
    answer_updated_at: readNullableString(value.answer_updated_at),
    current_display_order: Number(value.current_display_order),
    current_prompt: readString(value.current_prompt),
    current_rationale_markdown: readString(value.current_rationale_markdown),
    display_id: readString(value.display_id),
    id: readString(value.id),
    importance: readString(value.importance) as IntakeQuestionImportance,
    origin_turn_id: readString(value.origin_turn_id),
    session_id: readString(value.session_id),
    session_revision_seen: Number(value.session_revision_seen),
    status: readString(value.status) as IntakeQuestionStatus,
    superseded_by_question_id: readNullableString(value.superseded_by_question_id),
    tags: readQuestionTags(value.tags_json),
    updated_at: readString(value.updated_at),
  };
}

function readQuestionVersionRecord(row: unknown): IntakeQuestionVersionRecord | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const value = row as Record<string, unknown>;

  return {
    answer_text: readNullableString(value.answer_text),
    created_at: readString(value.created_at),
    display_id: readString(value.display_id),
    display_order: Number(value.display_order),
    id: readString(value.id),
    importance: readString(value.importance) as IntakeQuestionImportance,
    prompt: readString(value.prompt),
    question_id: readString(value.question_id),
    rationale_markdown: readString(value.rationale_markdown),
    session_id: readString(value.session_id),
    status: readString(value.status) as IntakeQuestionStatus,
    tags: readQuestionTags(value.tags_json),
    turn_id: readString(value.turn_id),
    version_number: Number(value.version_number),
  };
}

function readQuestionProvenanceEntries(
  db: ReturnType<typeof getPersistenceDatabase>,
  questionId: string,
): AuthoritativeProvenanceEntry[] {
  const currentVersion = readQuestionVersionRecord(
    db.prepare(
      [
        "SELECT *",
        "FROM intake_question_versions",
        "WHERE question_id = ?",
        "ORDER BY version_number DESC",
        "LIMIT 1",
      ].join("\n"),
    ).get(questionId),
  );

  if (!currentVersion) {
    return [];
  }

  return readAuthoritativeProvenanceEntries(db, "question_version", currentVersion.id);
}

function readAuthoritativeProvenanceEntries(
  db: ReturnType<typeof getPersistenceDatabase>,
  ownerKind: ProvenanceEntryRecord["owner_kind"],
  ownerId: string,
): AuthoritativeProvenanceEntry[] {
  return db
    .prepare(
      "SELECT * FROM provenance_entries WHERE owner_kind = ? AND owner_id = ? ORDER BY rowid ASC",
    )
    .all(ownerKind, ownerId)
    .map(readProvenanceEntryRow)
    .map((entry) => ({
      provenance_type: entry.provenance_type,
      label: entry.label,
      detail: parseJsonRecord(entry.detail_json),
      source_metadata: parseJsonRecord(entry.source_metadata_json),
    }));
}

function readProvenanceEntryRow(row: unknown): ProvenanceEntryRecord {
  const value = row as Record<string, unknown>;

  return {
    created_at: readString(value.created_at),
    detail_json: readString(value.detail_json),
    id: readString(value.id),
    label: readString(value.label),
    owner_id: readString(value.owner_id),
    owner_kind: readString(value.owner_kind) as ProvenanceEntryRecord["owner_kind"],
    provenance_type: readString(value.provenance_type) as ProvenanceEntryRecord["provenance_type"],
    source_metadata_json: readString(value.source_metadata_json),
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readQuestionTags(value: unknown): IntakeQuestionTag[] {
  try {
    const parsed = JSON.parse(readString(value));

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isIntakeQuestionTag).sort();
  } catch {
    return [];
  }
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isIntakeQuestionTag(value: unknown): value is IntakeQuestionTag {
  return typeof value === "string" && intakeQuestionTags.includes(value as IntakeQuestionTag);
}

function isLiveQuestion(question: IntakeQuestion | IntakeQuestionRecord): boolean {
  return question.status === "open" || question.status === "answered";
}

function nextQuestionDisplayId(): string {
  return `QUESTION-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function summarizeQuestionReconciliation(
  lineage: IntakeQuestionLineage[],
): Record<string, number> {
  return lineage.reduce<Record<string, number>>((summary, item) => {
    summary[item.relation_type] = (summary[item.relation_type] ?? 0) + 1;
    return summary;
  }, {});
}

function cleanupFailedInitialSession(
  db: ReturnType<typeof getPersistenceDatabase>,
  session: IntakeSession,
  requestPayload: Record<string, unknown>,
  turnId: string,
  hostedTurn: HostedTurnResult | null,
): void {
  db.transaction(() => {
    const now = new Date().toISOString();

    db.prepare(
      [
        "INSERT INTO intake_turns (",
        "  id, session_id, turn_number, turn_kind, base_brief_version_id, result_brief_version_id,",
        "  request_payload_json, llm_response_json, created_at, completed_at, status, provider, lane,",
        "  configured_model, resolved_model, input_tokens, output_tokens, total_tokens,",
        "  request_log_event_id, response_log_event_id, session_revision_before, session_revision_after,",
        "  question_reconciliation_summary_json",
        ") VALUES (",
        "  @id, @session_id, @turn_number, @turn_kind, @base_brief_version_id, @result_brief_version_id,",
        "  @request_payload_json, @llm_response_json, @created_at, @completed_at, @status, @provider, @lane,",
        "  @configured_model, @resolved_model, @input_tokens, @output_tokens, @total_tokens,",
        "  @request_log_event_id, @response_log_event_id, @session_revision_before, @session_revision_after,",
        "  @question_reconciliation_summary_json",
        ")",
      ].join("\n"),
    ).run({
      base_brief_version_id: null,
      completed_at: now,
      configured_model: hostedTurn?.configured_model ?? defaultConfiguredModel,
      created_at: now,
      id: turnId,
      input_tokens: hostedTurn?.usage?.input_tokens ?? null,
      lane: hostedTurn?.lane ?? intakeLane,
      llm_response_json: hostedTurn ? JSON.stringify(hostedTurn.output) : null,
      output_tokens: hostedTurn?.usage?.output_tokens ?? null,
      provider: hostedTurn?.provider ?? null,
      question_reconciliation_summary_json: null,
      request_log_event_id: hostedTurn?.request_log_event_id ?? null,
      request_payload_json: JSON.stringify(requestPayload),
      resolved_model: hostedTurn?.resolved_model ?? null,
      response_log_event_id: hostedTurn?.response_log_event_id ?? null,
      result_brief_version_id: null,
      session_id: session.id,
      session_revision_after: null,
      session_revision_before: session.session_revision,
      status: "failed",
      total_tokens: hostedTurn?.usage?.total_tokens ?? null,
      turn_kind: "initial",
      turn_number: 1,
    });

    db.prepare("DELETE FROM intake_sessions WHERE id = ?").run(session.id);
  })();
}

function readRequestText(requestPayloadJson: string | undefined): string {
  if (!requestPayloadJson?.trim()) {
    return "";
  }

  try {
    const parsed = JSON.parse(requestPayloadJson) as { request_text?: unknown };
    return typeof parsed.request_text === "string" ? parsed.request_text : "";
  } catch {
    return "";
  }
}

export function hashProposalInputManifest(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}

function openPersistence(options: { stateDir?: string } = {}) {
  initializeLogging({ stateDir: options.stateDir });
  return getPersistenceDatabase();
}
