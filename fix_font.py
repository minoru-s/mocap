import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Desktop h1 inside sidebar
# <h1 class="text-lg font-semibold text-gray-800 ml-3 tracking-tight">Mocap Plus</h1>
old_h1_desktop = '<h1 class="text-lg font-semibold text-gray-800 ml-3 tracking-tight">Mocap Plus</h1>'
new_h1_desktop = '<h1 class="text-xl font-bold text-gray-800 ml-3 tracking-tight">Mocap Plus</h1>'

if old_h1_desktop in content:
    content = content.replace(old_h1_desktop, new_h1_desktop)
    print("Desktop font weight increased")

# Mobile h1
# <h1 class="text-lg font-bold text-slate-800 ml-2">Mocap Plus</h1>
old_h1_mobile = '<h1 class="text-lg font-bold text-slate-800 ml-2">Mocap Plus</h1>'
new_h1_mobile = '<h1 class="text-xl font-bold text-slate-800 ml-2">Mocap Plus</h1>'

if old_h1_mobile in content:
    content = content.replace(old_h1_mobile, new_h1_mobile)
    print("Mobile font weight increased")


with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
