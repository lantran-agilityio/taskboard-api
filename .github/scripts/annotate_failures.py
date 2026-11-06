"""Print a GitHub Actions error annotation for each failed test in a JUnit report.

CI job logs are only visible when logged in to GitHub, but annotations are
public through the API, so a failure can be read without opening the log.

Usage: python annotate_failures.py pytest-report.xml
(the report from pytest --junitxml=... -o junit_family=xunit1, which records
each test's file and line).
"""

import sys
import xml.etree.ElementTree as ET

# Keep the end of a long traceback: that's where the assertion is.
MAX_DETAIL_LINES = 40


def escape_data(text: str) -> str:
    # Workflow commands are one line each: escape what would end or break it.
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def escape_property(text: str) -> str:
    return escape_data(text).replace(":", "%3A").replace(",", "%2C")


def annotations(report_path: str) -> list[str]:
    commands = []
    for case in ET.parse(report_path).getroot().iter("testcase"):
        for problem in [*case.findall("failure"), *case.findall("error")]:
            file = case.get("file")
            title = f"{file or case.get('classname')}::{case.get('name')}"
            properties = []
            if file:
                properties.append(f"file={escape_property(file)}")
                if case.get("line") is not None:
                    # JUnit lines are 0-based; GitHub's are 1-based.
                    properties.append(f"line={int(case.get('line', '0')) + 1}")
            properties.append(f"title={escape_property(title)}")
            detail = (problem.text or "").strip().splitlines()[-MAX_DETAIL_LINES:]
            message = "\n".join([problem.get("message") or "", "", *detail]).strip()
            commands.append(f"::error {','.join(properties)}::{escape_data(message)}")
    return commands


def main() -> None:
    for command in annotations(sys.argv[1]):
        print(command)


if __name__ == "__main__":
    main()
