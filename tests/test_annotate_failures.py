import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / ".github" / "scripts" / "annotate_failures.py"

SAMPLE_TESTS = """\
def test_passes():
    assert True


def test_fails():
    expected = "a,b: 100%"
    assert expected == "other"


def test_errors():
    raise RuntimeError("boom")
"""


def run_pytest(tmp_path: Path) -> Path:
    """Run pytest on a sample file and return its JUnit report, as CI does."""
    (tmp_path / "test_sample.py").write_text(SAMPLE_TESTS)
    report = tmp_path / "report.xml"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "test_sample.py",
            f"--junitxml={report}",
            "-o",
            "junit_family=xunit1",
            "-p",
            "no:cacheprovider",
        ],
        cwd=tmp_path,
        capture_output=True,
        check=False,  # the sample fails on purpose
    )
    return report


def annotate(report: Path) -> list[str]:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(report)],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.splitlines()


def test_one_error_annotation_per_failed_test(tmp_path: Path) -> None:
    lines = annotate(run_pytest(tmp_path))

    errors = [line for line in lines if line.startswith("::error ")]
    assert len(errors) == 2
    fails, crashes = errors
    # Points at the test's own line (1-based), so GitHub can show it in the diff.
    assert fails.startswith(
        "::error file=test_sample.py,line=5,title=test_sample.py%3A%3Atest_fails::"
    )
    assert crashes.startswith("::error file=test_sample.py,line=10,")
    assert "RuntimeError: boom" in crashes


def test_annotation_is_one_escaped_line(tmp_path: Path) -> None:
    fails = annotate(run_pytest(tmp_path))[0]

    message = fails.split("::", 2)[2]
    # Newlines and % are escaped, so the whole failure stays in one command.
    assert "%0A" in message
    assert "100%25" in message
    assert "assert 'a,b: 100%25' == 'other'" in message


def test_no_failures_prints_nothing(tmp_path: Path) -> None:
    (tmp_path / "test_sample.py").write_text("def test_ok():\n    assert True\n")
    report = tmp_path / "report.xml"
    subprocess.run(
        [sys.executable, "-m", "pytest", f"--junitxml={report}", "-q"],
        cwd=tmp_path,
        capture_output=True,
        check=True,
    )

    assert annotate(report) == []
