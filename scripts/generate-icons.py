"""Render the code-native form glyph to Chrome's required PNG sizes."""
from pathlib import Path
import struct
import zlib
import math
root = Path(__file__).resolve().parents[1] / 'extension/icons'
root.mkdir(exist_ok=True)
segments = [(34,27,90,27),(90,27,90,101),(90,101,34,101),(34,101,34,27),(46,44,77,44),(46,60,77,60),(46,76,66,76)]
def distance(x,y,a,b,c,d):
    t=max(0,min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)))
    return math.hypot(x-a-t*(c-a),y-b-t*(d-b))
def pixel(x,y):
    if math.hypot(max(abs(x-64)-36,0),max(abs(y-64)-36,0))>28:return (0,0,0,0)
    if any(distance(x,y,*s)<2.7 for s in segments):return (255,255,255,255)
    return (36,91,212,255)
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
for size in [16,32,48,128]:
    rows=[]
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            points=[pixel((x+(a+.5)/3)*128/size,(y+(b+.5)/3)*128/size) for a in range(3) for b in range(3)]
            row.extend(round(sum(p[i] for p in points)/9) for i in range(4))
        rows.append(row)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
    (root/f'icon{size}.png').write_bytes(data)
