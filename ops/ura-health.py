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
    # A persisted inspection cursor covers delayed or dropped scheduler runs.
    from ura_monitor import inspect_flows
    failures.extend(inspect_flows(output))
except (subprocess.SubprocessError, OSError, ValueError, KeyError):
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
