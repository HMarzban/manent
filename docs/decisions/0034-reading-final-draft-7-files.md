# 0034. Final Draft 7 files are read only for interoperability, and until their structure is known Manent asks for an .fdx

- Date: 2026-11-21
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Final Draft 5 to 7 save scripts as `.fdr`, a binary format. Final Draft 8 and later save `.fdx`, which is XML, and which Manent reads and writes. Writers still hold scripts in the older format and will try to open them.

Final Draft publishes no description of `.fdr`. The public descriptions found give the file's signature only; the fullest, PRONOM's entry `fmt/964` (The National Archives, UK), gives the bytes `FD FD FD FD` at offset 0, then the text `Final Draft, Inc` beginning 12 to 64 bytes after them.

Learning more needs `.fdr` files the project may lawfully use: files whose owners publish them for anyone to use (in the public domain, or under an open licence that allows copying them for testing), or files the project makes itself with software it lawfully holds. A time-boxed search on 2026-11-21 of public archives, code hosts and the test suites of open screenwriting tools found published `.fdr` scripts, but none with stated terms of use, and the project holds no software that writes the format. No `.fdr` file was read.

The basis on which Manent studies a file format is interoperability: making another program work with the files people already have, by reading those files and published descriptions of them. In the European Union, Directive 2009/24/EC allows a lawful user of a program to observe and study how it works (Article 5(3)) and limits decompilation to what interoperability needs (Article 6), and the Court of Justice held in case C-406/10, judgment of 2 May 2012, that the format of a program's data files is not a form of expression of that program protected by copyright under that directive. In the United States, 17 U.S.C. 102(b) gives no copyright protection to a method of operation, and 17 U.S.C. 1201(f) allows the analysis needed for interoperability of an independently created program. This is the project's record of the basis it works on, not legal advice.

## Options considered

- Read `.fdr` files as far as their structure is known. Not chosen: nothing beyond the signature is known, so a reader would recover no text, and a partial reader built from guesses would turn a script into a different one without saying so.
- Learn the structure from Final Draft's own program or installer. Rejected: Manent reads the files a program writes, never the program.
- Study published `.fdr` scripts whose owners state no terms of use. Rejected: a file shared without its owner's permission, or with unknown terms, is not used.
- Recognise a `.fdr` file and ask the writer to save it as `.fdx` in Final Draft 8 or later, then open that. Chosen.

## Decision

Manent reads Final Draft 7 and earlier files only for interoperability, from the files themselves and published descriptions of them, never from Final Draft's software, and it never writes them. Until their structure is known from such sources, Manent recognises a `.fdr` file and asks the writer to save it as `.fdx` in Final Draft 8 or later; no `.fdr` file is committed to the repository.

## Consequences and trade-offs

- A writer whose script exists only as `.fdr`, and who has no later Final Draft, cannot bring it into Manent directly; Manent offers no conversion of its own.
- A writer who brings a `.fdr` file is told how to bring the script across, instead of meeting a file Manent does not know.
- No `.fdr` sample sits in the repository or its tests, so nothing here depends on a file whose terms are unknown.

## Revisit when

A `.fdr` file whose owner publishes it for anyone to use, or a lawfully held copy of Final Draft 7 or earlier that can make one, becomes available together with a rendering of the same script; or a public description of the format's structure is published.
