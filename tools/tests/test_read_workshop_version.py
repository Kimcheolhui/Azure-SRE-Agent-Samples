import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "read_workshop_version", Path(__file__).resolve().parents[1] / "read_workshop_version.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VersionInputTests(unittest.TestCase):
    def test_rejects_non_workshop_or_credentialed_urls_before_network_access(self):
        for value in [
            "http://sre-pay-demo.azurewebsites.net",
            "https://example.com",
            "https://sre-pay-demo.azurewebsites.net/other",
            "https://user:secret@sre-pay-demo.azurewebsites.net",
            "https://sre-pay-demo.azurewebsites.net:443",
            "https://sre-pay-demo.azurewebsites.net?token=test",
            "https://sre-pay-demo.azurewebsites.net#fragment",
        ]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    module.main(value)


if __name__ == "__main__":
    unittest.main()
