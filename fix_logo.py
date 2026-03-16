import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('src="icons/icon-192.png"', 'src="icons/newicon-192.png"')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated logo source")
