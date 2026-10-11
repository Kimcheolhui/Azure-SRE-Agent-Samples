import json
import re
import socket
from urllib.parse import urlsplit
from urllib.request import urlopen


def main(app_url: str) -> dict:
    """Resolve and read only /version on a workshop Azure Web App."""
    parsed = urlsplit(app_url)
    if (parsed.scheme != "https" or not parsed.hostname
            or not re.fullmatch(r"sre-pay-[a-z0-9-]+\.azurewebsites\.net", parsed.hostname)
            or parsed.netloc != parsed.hostname or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment):
        raise ValueError("Use https://sre-pay-<suffix>.azurewebsites.net with no credentials, port or extra path")
    addresses = sorted({
        item[4][0] for item in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    })
    with urlopen(f"https://{parsed.hostname}/version", timeout=10) as response:
        version = json.load(response)
        status = response.status
    if not isinstance(version, dict) or "sourceCommit" not in version or "scenario" not in version:
        raise ValueError("Endpoint did not return the workshop version contract")
    return {"host": parsed.hostname, "resolvedAddresses": addresses,
            "httpStatus": status, "version": version}
