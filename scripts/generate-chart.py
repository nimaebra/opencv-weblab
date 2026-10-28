"""Generate an original, deterministic 8-bit color/edge calibration image (stdlib only)."""
import colorsys,struct,zlib
from pathlib import Path
width,height=1024,768
rows=bytearray()
for y in range(height):
    rows.append(0)
    for x in range(width):
        if y<240:
            colors=[(220,65,65),(231,153,60),(229,211,102),(89,155,107),(78,153,174),(85,102,169),(153,94,163),(230,230,220)]
            rgb=colors[min(7,x//128)]
        elif y<480:
            rgb=tuple(round(c*255) for c in colorsys.hsv_to_rgb(x/width,.75,(y-240)/240*.6+.3))
        elif x<512:
            v=235 if (x//32+y//32)%2 else 24;rgb=(v,v,v)
        else:
            v=round((x-512)/511*255);rgb=(v,v,v)
        if (x-512)**2+(y-384)**2<92**2:rgb=(245,245,235)
        rows.extend(rgb)
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
image=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows,9))+chunk(b'IEND',b'')
Path(__file__).resolve().parents[1].joinpath('apps/web/public/samples/calibration.png').write_bytes(image)
