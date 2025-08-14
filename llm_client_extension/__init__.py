
try:
    from ._version import __version__
except ImportError:
    # package is not installed
    __version__ = "dev"

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "llm-client-extension"
    }]
