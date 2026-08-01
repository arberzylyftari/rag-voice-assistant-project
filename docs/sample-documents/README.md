# Sample Knowledge Base

The seed corpus the assistant answers from. All seven documents are fictional
internal policies of **Nexora sh.p.k.**, an invented software company, written
in Albanian because the Knowledge Base is product content.

Nothing here describes a real company, and no document contains real personal
data.

## Documents

| File | Document | Owner |
| --- | --- | --- |
| [manuali-i-punonjesit.md](manuali-i-punonjesit.md) | Employee Handbook | HR |
| [politika-e-pushimeve.md](politika-e-pushimeve.md) | Leave Policy | HR |
| [politika-e-punes-nga-larg.md](politika-e-punes-nga-larg.md) | Remote Work Policy | HR |
| [politika-e-shpenzimeve.md](politika-e-shpenzimeve.md) | Expense Policy | Finance |
| [udhezues-mbeshtetja-it.md](udhezues-mbeshtetja-it.md) | IT Support Guide | IT |
| [politika-e-sigurise.md](politika-e-sigurise.md) | Information Security Policy | IT |
| [pyetje-te-shpeshta.md](pyetje-te-shpeshta.md) | FAQ | HR |

## How they are written

- **Heading-structured.** Every document uses a consistent `##` / `###`
  hierarchy so chunking can follow section boundaries instead of cutting
  mid-topic.
- **Concrete and checkable.** Facts are specific numbers, deadlines and
  amounts (21 working days of annual leave, 35 lekë per kilometre, 4-hour
  response time for a P2 ticket), so an answer can be verified against the
  source rather than judged by how plausible it sounds.
- **Cross-referenced.** Documents point at each other the way real policies
  do. The FAQ intentionally repeats facts stated in the source documents,
  which gives retrieval more than one plausible passage per question.
- **Internally consistent.** A fact that appears in two documents has the same
  value in both. Contradictions would make grounding failures impossible to
  distinguish from source conflicts.

## Test questions

Kept here so the grounding and refusal behaviour can be re-checked whenever
retrieval or the prompt changes.

### Answerable — single document

- Sa ditë pushimi vjetor kam?
- Sa ditë në javë mund të punoj nga larg?
- Sa është dieta ditore për udhëtim brenda vendit?
- Brenda sa kohe duhet të raportoj humbjen e laptopit?
- Sa është buxheti vjetor për trajnime?

### Answerable — needs more than one document

- Çfarë duhet të dorëzoj ditën e fundit të punës?
  (Employee Handbook + IT Support Guide)
- Nëse punoj nga një kafene, çfarë rregullash sigurie duhet të ndjek?
  (Remote Work Policy + Security Policy)
- Si e marr kontributin për zyrën në shtëpi?
  (Remote Work Policy + Expense Policy)

### Follow-up questions — session memory

1. "Sa ditë pushimi vjetor kam?" → 2. "Po pas pesë vjetësh?"
2. "Sa është dieta ditore?" → 3. "Po për jashtë vendit?"

### False premises — the answer must correct the premise

- Nga 30 ditët e pushimit vjetor, sa mund të bart? (annual leave is 21 days)
- Meqë mund të punoj nga larg gjithë javën, a duhet të njoftoj dikë?
  (remote work is capped at 3 days a week)
- Sa rimbursohet gjoba e parkimit gjatë udhëtimit të punës?
  (fines are never reimbursed)

### Out of scope — the assistant must refuse

- Sa është paga mesatare e një inxhinieri softuerësh në Nexora?
- A ofron kompania plan pensioni privat?
- A lejohen kafshët shtëpiake në zyrë?
- Sa është kryeqyteti i Shqipërisë? (general knowledge, not in the KB)

## Format

The corpus is stored as Markdown: it reviews well in git and its heading
structure is what the chunker keys on.

The admin panel accepts PDF, TXT and DOCX uploads. Converted copies of these
documents are used to exercise those parsers during the admin milestone —
the Markdown files here stay the source of truth.
