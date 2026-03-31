Mode: finalize intake briefing
Project root: {{project_root}}
Branch: {{branch_name}}
Session id: {{session_id}}
Original request:
{{request_text}}

Current brief entries:
{{brief_entries_json}}

Current questions:
{{questions_json}}

Operator answers:
{{answers_json}}

Finalize note:
{{finalize_note}}

Return:
- the final structured project brief
- structured question actions only if a question must be retained, superseded, or satisfied before closure
- no new unnecessary questions
- assume the operator is willing to accept remaining uncertainty if it is captured explicitly in accepted_uncertainties and recommendations
