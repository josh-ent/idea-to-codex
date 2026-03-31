Mode: continue intake briefing
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

Return:
- revised structured brief entries
- structured question actions
- for every current question, either retain_existing, supersede_existing, or satisfied_no_longer_needed
- create_new only when a genuinely new project-local question is required
