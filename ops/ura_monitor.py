"""Persist completed database inspections, independently of scheduler frequency."""
import datetime
import json
import os
import pathlib
import shlex
import fcntl

REQUIRED_FLOWS = {
    'ec86d49a-fb3c-4d9e-aa74-6e94fe778271': 'Publish scheduled content',
    'a5596847-c051-412b-9eeb-ed0f958c66a3': 'Revalidate Astro cache',
    'a2bf5de4-935f-4759-b44e-3fb928b8b8f7': 'Send emails for forms',
}


def inspect_flows(output, state_dir='/var/lib/ura-monitor'):
    root = pathlib.Path(state_dir)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (root / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cursor = root / 'inspection.json'
        now = datetime.datetime.now(datetime.timezone.utc)
        previous = json.loads(cursor.read_text()) if cursor.exists() else {}
        start = datetime.datetime.fromisoformat(previous['through']) if previous else now - datetime.timedelta(days=1)
        if start.tzinfo is None or start > now:
            raise ValueError('Invalid inspection cursor')
        # Overlap includes transactions that finish just after an inspection.
        start -= datetime.timedelta(minutes=5)
        sql = """SELECT json_build_object(
          'through', now(),
          'active', (SELECT coalesce(json_agg(id), '[]') FROM directus_flows WHERE status='active'),
          'errors', (SELECT coalesce(json_agg(r.id), '[]') FROM directus_revisions r
            JOIN directus_activity a ON a.id=r.activity
            JOIN directus_operations o ON o.id::text=(r.data::jsonb->'steps'->-1->>'operation')
            WHERE r.collection='directus_flows' AND a.timestamp >= '%s'::timestamptz AND a.timestamp <= now()
            AND r.data::jsonb->'steps'->-1->>'status'='reject' AND o.type <> 'condition'))""" % start.isoformat()
        script = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc ' + shlex.quote(sql)
        data = json.loads(output(['docker', 'exec', 'directus_postgres', 'sh', '-ec', script]))
        through = datetime.datetime.fromisoformat(data['through'])
        if through.tzinfo is None or through < start:
            raise ValueError('Invalid database inspection timestamp')
        failures = [name + ' flow is missing or inactive' for flow_id, name in REQUIRED_FLOWS.items() if flow_id not in data['active']]
        unseen = set(data['errors']) - set(previous.get('seen_errors', []))
        if unseen:
            failures.append(f'{len(unseen)} CMS flow execution(s) ended with a failed operation since the previous inspection')
        pending = root / 'inspection.tmp'
        with pending.open('w') as target:
            os.chmod(pending, 0o600)
            json.dump({'through': data['through'], 'seen_errors': data['errors']}, target)
            target.flush()
            os.fsync(target.fileno())
        os.replace(pending, cursor)
        return failures
