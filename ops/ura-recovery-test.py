#!/usr/bin/env python3
"""Rebuild a private service stack exclusively from an encrypted Ura checkpoint.

Run as root: ura-recovery-test.py /var/backups/ura/ura-TIMESTAMP.tar.age
Requires Docker, age, curl, tar, Python, and the separately protected age identity.
Only loopback port 3443 is published. All restored flows and mail are disabled.
The CMS has outbound access for license validation. Production mounts are not used.
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time

os.umask(0o077)
archive = pathlib.Path(sys.argv[1]).resolve(strict=True)
root = pathlib.Path(tempfile.mkdtemp(prefix='ura-recovery-', dir='/var/backups/ura'))
prefix = 'ura-recovery-' + str(os.getpid())
network = prefix
containers = []


def run(*args, **kwargs):
    return subprocess.run(args, check=True, stdout=subprocess.DEVNULL, **kwargs)


def env_file(name, values):
    path = root / (name + '.env')
    path.write_text('\n'.join(k + '=' + v for k, v in values.items()) + '\n')
    return str(path)


def start(name, image, env, mounts=(), extra=(), memory='512m'):
    container = prefix + '-' + name
    containers.append(container)
    args = ['docker', 'run', '-d', '--name', container, '--network', network,
            '--network-alias', name, '--memory', memory, '--cpus', '0.75',
            '--log-driver', 'local', '--env-file', env_file(name, env)]
    for source, destination in mounts:
        args += ['-v', str(source) + ':' + destination]
    run(*args, *extra, image)
    return container


def wait_for(args, attempts=90):
    for _ in range(attempts):
        if subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            return
        time.sleep(2)
    raise RuntimeError('Recovery service did not become ready')


try:
    decrypt = subprocess.Popen(['age', '-d', '-i', '/etc/ura/backup.agekey', str(archive)], stdout=subprocess.PIPE)
    run('tar', '-xf', '-', '-C', str(root), stdin=decrypt.stdout)
    decrypt.stdout.close()
    if decrypt.wait() != 0:
        raise RuntimeError('Decryption failed')
    run('sha256sum', '--check', '--quiet', 'manifest.sha256', cwd=root)
    run('sha256sum', '--check', '--quiet', 'uploads.sha256', cwd=root)
    with (root / 'images.tar.gz').open('rb') as images:
        run('docker', 'load', stdin=images)
    run('git', 'clone', '--quiet', str(root / 'source.bundle'), str(root / 'source'))
    run('git', '-C', str(root / 'source'), 'checkout', '--quiet', (root / 'revision').read_text().strip())
    configs = json.loads((root / 'containers.json').read_text())
    app, cms, db, redis = configs
    def environment(config):
        return dict(value.split('=', 1) for value in config['Config']['Env'])
    run('docker', 'network', 'create', '--internal', network)
    pg = start('db', db['Image'], environment(db), [(root / 'pgdata', '/var/lib/postgresql')])
    pg_env = environment(db)
    wait_for(['docker', 'exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', pg_env['POSTGRES_USER']])
    with (root / 'database.dump').open('rb') as dump:
        run('docker', 'exec', '-i', pg, 'pg_restore', '-U', pg_env['POSTGRES_USER'], '-d', pg_env['POSTGRES_DB'], '--no-owner', '--no-acl', '--exit-on-error', stdin=dump)
    run('docker', 'exec', pg, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', pg_env['POSTGRES_USER'], '-d', pg_env['POSTGRES_DB'], '-c', "UPDATE directus_flows SET status='inactive'")
    start('redis', redis['Image'], environment(redis), memory='96m')
    cms_env = environment(cms)
    cms_env.update(DB_HOST='db', REDIS='redis://redis:6379', PUBLIC_URL='http://cms:8055', EMAIL_TRANSPORT='sendmail', EMAIL_SENDMAIL_PATH='/bin/false')
    for key in list(cms_env):
        if key.startswith('EMAIL_SMTP_'):
            del cms_env[key]
    directus = start('cms', cms['Image'], cms_env, [(root / 'uploads', '/directus/uploads'), (root / 'extensions', '/directus/extensions')])
    run('docker', 'network', 'connect', '--gw-priority', '1', 'bridge', directus)
    wait_for(['docker', 'exec', directus, 'node', '-e', "fetch('http://localhost:8055/server/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"])
    app_env = environment(app)
    app_env.update(DIRECTUS_URL='http://cms:8055', PUBLIC_DIRECTUS_URL='http://cms:8055', REDIS_HOST='redis', OPENWEATHER_API_KEY='')
    astro = start('app', app['Image'], app_env)
    wait_for(['docker', 'exec', astro, 'node', '-e', "fetch('http://localhost:4321/en').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"])
    conf = (root / 'nginx.conf').read_text().replace('http://127.0.0.1:8055', 'http://cms:8055')
    (root / 'vhost.conf').write_text(conf)
    upstream = (root / 'host/etc/nginx/conf.d/ura-upstream.conf').read_text()
    upstream = re.sub(r'127\.0\.0\.1:432[123]', 'app:4321', upstream)
    (root / 'upstream.conf').write_text(upstream)
    (root / 'nginx-main.conf').write_text('events {}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/ura-upstream.conf; include /etc/nginx/ura-vhost.conf; }\n')
    nginx = start('nginx', (root / 'image-ids').read_text().splitlines()[-1], {}, [
        (root / 'nginx-main.conf', '/etc/nginx/nginx.conf:ro'),
        (root / 'vhost.conf', '/etc/nginx/ura-vhost.conf:ro'),
        (root / 'upstream.conf', '/etc/nginx/ura-upstream.conf:ro'),
        (root / 'host/etc/nginx/snippets', '/etc/nginx/snippets:ro'),
        (root / 'host/etc/letsencrypt', '/etc/letsencrypt:ro'),
        (root / 'host/assets', '/var/lib/ura-assets:ro'),
    ], extra=['-p', '127.0.0.1:3443:443'], memory='96m')
    run('docker', 'exec', nginx, 'nginx', '-t')
    wait_for(['docker', 'exec', nginx, 'curl', '--fail', '--silent', '--resolve', 'ura.design:443:127.0.0.1', 'https://ura.design/en'], attempts=30)
    # Container-internal requests avoid reliance on host reachability of internal networks.
    for host, path in [('ura.design', '/en'), ('ura.design', '/de'), ('ura.design', '/en/about'), ('ura.design', '/favicon.ico'), ('cms.ura.design', '/server/ping'), ('cms.ura.design', '/admin/')]:
        run('docker', 'exec', nginx, 'curl', '--fail', '--silent', '--show-error', '--resolve', host + ':443:127.0.0.1', 'https://' + host + path)
    for asset in (root / 'host/assets').iterdir():
        if asset.is_file():
            run('docker', 'exec', nginx, 'curl', '--fail', '--silent', '--show-error', '--resolve', 'ura.design:443:127.0.0.1', 'https://ura.design/_astro/' + asset.name)
            break
    run('docker', 'exec', astro, 'node', '-e', "fetch(process.env.DIRECTUS_URL+'/items/pages?limit=1',{headers:{Authorization:'Bearer '+process.env.DIRECTUS_WEBSITE_TOKEN}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))")
    print(json.dumps({'ok': True, 'checks': ['encrypted manifest', 'upload hashes', 'source checkout', 'archived images', 'database', 'CMS', 'restricted website identity', 'Astro English/German', 'Nginx TLS and dependencies', 'favicon and shared assets'], 'materials': str(root)}))
finally:
    for container in reversed(containers):
        subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Keep private recovery materials for inspection; report the exact directory.
    print('Private rehearsal materials: ' + str(root))
