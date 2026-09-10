import json, pathlib, subprocess, sys, time

def output(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()

failures = []
for marker, max_age in [('last-success', 27 * 3600), ('last-restore-success', 27 * 3600)]:
    try:
        if time.time() - int(pathlib.Path('/var/backups/ura', marker).read_text()) > max_age:
            failures.append(marker + ' is overdue')
    except (OSError, ValueError):
        failures.append(marker + ' is missing')
try:
    port = pathlib.Path('/var/lib/ura-deploy/active-port').read_text().strip()
    app = 'ura_astro_' + port
except OSError:
    app = 'uradotdesign-astro-1'
for name in [app, 'directus_cms', 'directus_postgres', 'ura_redis']:
    try:
        data = json.loads(output(['docker', 'inspect', name]))[0]
        if data['State'].get('Health', {}).get('Status') != 'healthy':
            failures.append(name + ' is unhealthy')
    except (subprocess.SubprocessError, ValueError):
        failures.append(name + ' cannot be inspected')
try:
    # Only an aggregate count leaves Postgres; no credentials/content are printed.
    script = '''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM directus_flows WHERE status='active'"'''
    if int(output(['docker', 'exec', 'directus_postgres', 'sh', '-ec', script])) < 3:
        failures.append('A required CMS flow is inactive')
    # A terminal failed operation is actionable; a false Condition branch is not.
    sql = """SELECT count(*) FROM directus_revisions r
      JOIN directus_activity a ON a.id=r.activity
      JOIN directus_operations o ON o.id::text=(r.data::jsonb->'steps'->-1->>'operation')
      WHERE r.collection='directus_flows' AND a.timestamp > now()-interval '20 minutes'
      AND r.data::jsonb->'steps'->-1->>'status'='reject' AND o.type <> 'condition'"""
    script = 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc ' + __import__('shlex').quote(sql)
    if int(output(['docker', 'exec', 'directus_postgres', 'sh', '-ec', script])):
        failures.append('A CMS flow ended with a failed operation in the last 20 minutes')
except subprocess.SubprocessError:
    failures.append('CMS database or required flows check failed')
try:
    for name in ['ura.design', 'cms.ura.design']:
        subprocess.run(['openssl', 'x509', '-checkend', str(21*86400), '-noout', '-in', f'/etc/letsencrypt/live/{name}/fullchain.pem'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except subprocess.SubprocessError:
    failures.append('A certificate expires within 21 days')
usage = __import__('shutil').disk_usage('/')
if usage.free / usage.total < 0.15:
    failures.append('Host disk free space below 15%')
print(json.dumps({'ok': not failures, 'failures': failures}))
sys.exit(bool(failures))
