"""
One-shot script to fix ProductGroupRows qty fallback and status badge tone
in app/(embedded)/products/page.tsx
"""

path = "app/(embedded)/products/page.tsx"
content = open(path, "rb").read().decode("utf-8")

# The file contains the literal 6-char sequence \u2014 (not the em dash character)
EM = "\\u2014"

old = (
    f"first.catalog_quantity ?? '{EM}'}}</Text></IndexTable.Cell>\n"
    "        <IndexTable.Cell>\n"
    "          {status ? (\n"
    "            <Badge tone={status === 'ACTIVE' ? 'success' : undefined}>"
)

new = (
    f"(first.catalog_quantity ?? first.last_synced_quantity) != null"
    f" ? (first.catalog_quantity ?? first.last_synced_quantity)!.toLocaleString()"
    f" : '{EM}'}}</Text></IndexTable.Cell>\n"
    "        <IndexTable.Cell>\n"
    "          {status && status !== 'UNKNOWN' ? (\n"
    "            <Badge tone={status === 'ACTIVE' ? 'success' : status === 'DRAFT' ? 'attention' : undefined}>"
)

if old in content:
    result = content.replace(old, new, 1)
    open(path, "wb").write(result.encode("utf-8"))
    print("DONE")
else:
    print("NOT FOUND — old string not present in file")
