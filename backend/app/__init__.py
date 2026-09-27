"""CivicPulse backend application package.

Declaring this package explicitly matters for two reasons. Without it the
project is only an implicit namespace package, so ``setuptools.find_packages``
returns zero packages and the installed distribution contains no modules --
which is what made coverage report 0% under a non-editable install. It also
gives mypy a real package root, so type checking the whole ``app`` tree works
instead of needing ``--explicit-package-bases`` to paper over the gap.
"""
