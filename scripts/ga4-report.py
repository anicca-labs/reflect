import base64, json, os, subprocess, tempfile, time, urllib.parse, urllib.request


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=')


email = os.environ['GA4_CLIENT_EMAIL']
key = os.environ['GA4_PRIVATE_KEY']
now = int(time.time())
header = b64u(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
claims = b64u(json.dumps({
    "iss": email, "scope": "https://www.googleapis.com/auth/analytics.readonly",
    "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600,
}).encode())
signing_input = header + b'.' + claims
with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=False) as f:
    f.write(key)
    keyfile = f.name
sig = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', keyfile],
                     input=signing_input, capture_output=True, check=True).stdout
os.unlink(keyfile)
jwt = (signing_input + b'.' + b64u(sig)).decode()

data = urllib.parse.urlencode({
    'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': jwt,
}).encode()
tok = json.loads(urllib.request.urlopen(
    urllib.request.Request('https://oauth2.googleapis.com/token', data=data)).read())
access = tok['access_token']
print('token: OK')

req = urllib.request.Request(
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
    headers={'Authorization': f'Bearer {access}'})
summaries = json.loads(urllib.request.urlopen(req).read())
props = []
for acct in summaries.get('accountSummaries', []):
    for p in acct.get('propertySummaries', []):
        props.append((p['property'], p.get('displayName')))
        print('property:', p['property'], '-', p.get('displayName'))

if props:
    pid = props[0][0]
    body = json.dumps({
        "dateRanges": [{"startDate": "14daysAgo", "endDate": "today"}],
        "dimensions": [{"name": "date"}],
        "metrics": [{"name": "activeUsers"}, {"name": "newUsers"}],
        "orderBys": [{"dimension": {"dimensionName": "date"}, "desc": True}],
    }).encode()
    req = urllib.request.Request(
        f'https://analyticsdata.googleapis.com/v1beta/{pid}:runReport',
        data=body,
        headers={'Authorization': f'Bearer {access}', 'Content-Type': 'application/json'})
    report = json.loads(urllib.request.urlopen(req).read())
    print('\nDAU last 14 days (date, activeUsers, newUsers):')
    for row in report.get('rows', []):
        d = row['dimensionValues'][0]['value']
        vals = [m['value'] for m in row['metricValues']]
        print(f"  {d}: active={vals[0]} new={vals[1]}")
