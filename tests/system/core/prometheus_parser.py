# File adopted from an external project. Keep it in its original form if possible.
#
# The file has been modified by Stork developer to support the sample values
# grater than max 64-integer.
#
# pylint: skip-file

"""
Prometheus metrics parser.

Source: https://raw.githubusercontent.com/prometheus/client_python/master/prometheus_client/parser.py
Homepage: https://github.com/prometheus/client_python
License: Apache 2.0
Date: 2022-07-18
Commit: 748ffb00600dc25fbd22d37d549578e8e370d996
"""

import io as StringIO
import re
from typing import Dict, List, NamedTuple, Optional, Union


# Timestamp and exemplar are optional.
# Value can be an int or a float.
# Timestamp can be a float containing a unixtime in seconds,
# a Timestamp object, or None.
# Exemplar can be an Exemplar object, or None.


class Timestamp(NamedTuple):
    seconds: float
    nanoseconds: float


class Exemplar(NamedTuple):
    labels: Dict[str, str]
    value: float
    timestamp: Optional[Union[float, Timestamp]] = None


class Sample(NamedTuple):
    name: str
    labels: Dict[str, str]
    value: float
    timestamp: Optional[Union[float, Timestamp]] = None
    exemplar: Optional[Exemplar] = None


class Metric(NamedTuple):
    name: str
    documentation: str
    typ: str
    samples: List[Sample]
    unit: Optional[str] = ""


def text_string_to_metric_families(text):
    """Parse Prometheus text format from a unicode string.

    See text_fd_to_metric_families.
    """
    yield from text_fd_to_metric_families(StringIO.StringIO(text))


ESCAPE_SEQUENCES = {
    "\\\\": "\\",
    "\\n": "\n",
    '\\"': '"',
}


def replace_escape_sequence(match):
    return ESCAPE_SEQUENCES[match.group(0)]


HELP_ESCAPING_RE = re.compile(r"\\[\\n]")
ESCAPING_RE = re.compile(r'\\[\\n"]')


def _replace_help_escaping(s):
    return HELP_ESCAPING_RE.sub(replace_escape_sequence, s)


def _replace_escaping(s):
    return ESCAPING_RE.sub(replace_escape_sequence, s)


def _is_character_escaped(s, charpos):
    num_bslashes = 0
    while charpos > num_bslashes and s[charpos - 1 - num_bslashes] == "\\":
        num_bslashes += 1
    return num_bslashes % 2 == 1


def _parse_labels(labels_string):
    labels = {}
    # Return if we don't have valid labels
    if "=" not in labels_string:
        return labels

    escaping = False
    if "\\" in labels_string:
        escaping = True

    # Copy original labels
    sub_labels = labels_string
    try:
        # Process one label at a time
        while sub_labels:
            # The label name is before the equal
            value_start = sub_labels.index("=")
            label_name = sub_labels[:value_start]
            sub_labels = sub_labels[value_start + 1 :].lstrip()
            # Find the first quote after the equal
            quote_start = sub_labels.index('"') + 1
            value_substr = sub_labels[quote_start:]

            # Find the last unescaped quote
            i = 0
            while i < len(value_substr):
                i = value_substr.index('"', i)
                if not _is_character_escaped(value_substr, i):
                    break
                i += 1

            # The label value is between the first and last quote
            quote_end = i + 1
            label_value = sub_labels[quote_start:quote_end]
            # Replace escaping if needed
            if escaping:
                label_value = _replace_escaping(label_value)
            labels[label_name.strip()] = label_value

            # Remove the processed label from the sub-slice for next iteration
            sub_labels = sub_labels[quote_end + 1 :]
            next_comma = sub_labels.find(",") + 1
            sub_labels = sub_labels[next_comma:].lstrip()

        return labels

    except ValueError:
        raise ValueError("Invalid labels: %s" % labels_string)


# If we have multiple values only consider the first
def _parse_value_and_timestamp(s):
    '''
    Warning: This function has been modified by Stork developer.
    '''
    s = s.lstrip()
    separator = " "
    if separator not in s:
        separator = "\t"
    values = [value.strip() for value in s.split(separator) if value.strip()]
    if not values:
        return _parse_number(s), None
    value = _parse_number(values[0])
    timestamp = (float(values[-1]) / 1000) if len(values) > 1 else None
    return value, timestamp

def _parse_number(s):
    '''
    Parse a string as int or float.

    Warning: It is a function added by Stork developer to the original file.
    '''
    if '.' in s or 'e' in s or 'E' in s:
        return float(s)
    return int(s)
    
def _parse_sample(text):
    # Detect the labels in the text
    try:
        label_start, label_end = text.index("{"), text.rindex("}")
        # The name is before the labels
        name = text[:label_start].strip()
        # We ignore the starting curly brace
        label = text[label_start + 1 : label_end]
        # The value is after the label end (ignoring curly brace and space)
        value, timestamp = _parse_value_and_timestamp(text[label_end + 2 :])
        return Sample(name, _parse_labels(label), value, timestamp)

    # We don't have labels
    except ValueError:
        # Detect what separator is used
        separator = " "
        if separator not in text:
            separator = "\t"
        name_end = text.index(separator)
        name = text[:name_end]
        # The value is after the name
        value, timestamp = _parse_value_and_timestamp(text[name_end:])
        return Sample(name, {}, value, timestamp)


def text_fd_to_metric_families(fd):
    """Parse Prometheus text format from a file descriptor.

    This is a laxer parser than the main Go parser,
    so successful parsing does not imply that the parsed
    text meets the specification.

    Yields Metric's.
    """
    name = ""
    documentation = ""
    typ = "untyped"
    samples = []
    allowed_names = []

    def build_metric(name, documentation, typ, samples):
        # Munge counters into OpenMetrics representation
        # used internally.
        if typ == "counter":
            if name.endswith("_total"):
                name = name[:-6]
            else:
                new_samples = []
                for s in samples:
                    new_samples.append(Sample(s[0] + "_total", *s[1:]))
                    samples = new_samples
        metric = Metric(name, documentation, typ, samples)
        return metric

    for line in fd:
        line = line.strip()

        if line.startswith("#"):
            parts = line.split(None, 3)
            if len(parts) < 2:
                continue
            if parts[1] == "HELP":
                if parts[2] != name:
                    if name != "":
                        yield build_metric(name, documentation, typ, samples)
                    # New metric
                    name = parts[2]
                    typ = "untyped"
                    samples = []
                    allowed_names = [parts[2]]
                if len(parts) == 4:
                    documentation = _replace_help_escaping(parts[3])
                else:
                    documentation = ""
            elif parts[1] == "TYPE":
                if parts[2] != name:
                    if name != "":
                        yield build_metric(name, documentation, typ, samples)
                    # New metric
                    name = parts[2]
                    documentation = ""
                    samples = []
                typ = parts[3]
                allowed_names = {
                    "counter": [""],
                    "gauge": [""],
                    "summary": ["_count", "_sum", ""],
                    "histogram": ["_count", "_sum", "_bucket"],
                }.get(typ, [""])
                allowed_names = [name + n for n in allowed_names]
            else:
                # Ignore other comment tokens
                pass
        elif line == "":
            # Ignore blank lines
            pass
        else:
            sample = _parse_sample(line)
            if sample.name not in allowed_names:
                if name != "":
                    yield build_metric(name, documentation, typ, samples)
                # New metric, yield immediately as untyped singleton
                name = ""
                documentation = ""
                typ = "untyped"
                samples = []
                allowed_names = []
                yield build_metric(sample[0], documentation, typ, [sample])
            else:
                samples.append(sample)

    if name != "":
        yield build_metric(name, documentation, typ, samples)
