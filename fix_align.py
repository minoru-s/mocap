import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Desktop sidebar
old_desktop = '<div class="flex items-center px-6 h-16 pt-4">'
new_desktop = '<div class="flex items-center justify-center px-6 h-16 pt-4">'

if old_desktop in content:
    content = content.replace(old_desktop, new_desktop)
    print("Desktop alignment fixed")

# Also the user wants to center the logo and text. Maybe the pt-4 makes it not vertically centered relative to the top bar?
# Usually a sidebar top height matches the main content top height. Let's keep pt-4 for now, but add justify-center to horizontally center it.

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
