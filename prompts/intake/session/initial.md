Mode: initial intake briefing
Project root: {{project_root}}
Branch: {{branch_name}}
Request:
{{request_text}}

Current brief entries:
{{brief_entries_json}}

Current questions:
{{questions_json}}

Operator answers:
{{answers_json}}

Return:
- structured brief entries for the current best project brief
- only the project-local questions still worth asking now
- structured question actions using create_new only in the initial turn
