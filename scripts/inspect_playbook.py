import re

with open('scripts/generate_playbook_es_pdf.py', encoding='utf-8') as f:
    text = f.read()

pages = text.split('<div class="page">')
for i, p in enumerate(pages[1:], 1):
    print(f"\n=== ES PAGE {i} ===")
    lines = [line.strip() for line in p.split('\n') if any(tag in line for tag in ['<h1>', '<h3>', '<div class="section-header">'])]
    for l in lines[:15]:
        print(" ", re.sub('<[^<]+?>', '', l))
