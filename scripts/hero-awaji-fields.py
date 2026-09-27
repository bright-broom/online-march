"""
トップのヒーロー画像（public/images/hero-awaji-fields.jpg）の元。南あわじの玉ねぎ畑を SVG で描く。
描き直すとき: python3 scripts/hero-awaji-fields.py → hero.svg を Chromium で 2400x1350 の JPEG（品質84）に書き出す。
生産者さんの実際の畑の写真が手に入ったら、そちらに差し替える（config/images.ts#heroFields）。
"""
import random, math
random.seed(7)
W,H=2400,1350
HOR=585          # plain horizon (sea line behind)
VP=(1520,578)    # vanishing point of foreground rows
out=[]
a=out.append
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
a('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stop-color="#8fa9bd"/><stop offset="0.28" stop-color="#c9c3b4"/>
 <stop offset="0.52" stop-color="#efcf9e"/><stop offset="0.78" stop-color="#f7dca8"/><stop offset="1" stop-color="#fae3b5"/>
</linearGradient>
<radialGradient id="sun" cx="1790" cy="455" r="620" gradientUnits="userSpaceOnUse">
 <stop offset="0" stop-color="#fff8e4" stop-opacity="1"/><stop offset="0.08" stop-color="#fff1cf" stop-opacity=".95"/>
 <stop offset="0.3" stop-color="#ffdca0" stop-opacity=".45"/><stop offset="1" stop-color="#ffd08a" stop-opacity="0"/>
</radialGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stop-color="#a9bcc2"/><stop offset="1" stop-color="#c7c6b4"/>
</linearGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stop-color="#fbe6bf" stop-opacity="0"/><stop offset="0.45" stop-color="#fbe3b8" stop-opacity=".55"/><stop offset="1" stop-color="#fbe3b8" stop-opacity="0"/>
</linearGradient>
<linearGradient id="warm" x1="0" y1="0" x2="1" y2="0">
 <stop offset="0" stop-color="#2a3a2a" stop-opacity=".35"/><stop offset="0.55" stop-color="#ffcf8a" stop-opacity="0"/><stop offset="1" stop-color="#ffc97a" stop-opacity=".28"/>
</linearGradient>
<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stop-color="#8d9a5c"/><stop offset="1" stop-color="#3f5a2a"/>
</linearGradient>
<filter id="blur8" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="blur3"><feGaussianBlur stdDeviation="2.5"/></filter>
<filter id="blur30" x="-60%" y="-300%" width="220%" height="700%"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%">
 <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>
 <feColorMatrix type="saturate" values="0"/>
 <feComponentTransfer><feFuncA type="table" tableValues="0 0.09"/></feComponentTransfer>
 <feComposite in2="SourceGraphic" operator="in"/>
</filter>
</defs>''')
# sky
a(f'<rect width="{W}" height="{HOR+40}" fill="url(#sky)"/>')
a(f'<rect width="{W}" height="{HOR+40}" fill="url(#sun)"/>')
# clouds
for cx,cy,rx,ry,o in [(520,190,380,38,.35),(900,260,300,26,.3),(1300,150,420,30,.28),(2150,230,360,28,.3),(1950,330,260,18,.35),(300,330,240,20,.25)]:
    a(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#fff4de" opacity="{o}" filter="url(#blur30)"/>')
# sun disc
a('<circle cx="1790" cy="455" r="46" fill="#fffaf0" opacity=".95" filter="url(#blur3)"/>')
# distant islands on sea (Shikoku / islands) hazy
a(f'<rect x="0" y="{HOR-40}" width="{W}" height="70" fill="url(#sea)"/>')
def ridge(y0, amp, color, op, x0=0, x1=W, seed=1, step=40, blur=None):
    r=random.Random(seed); pts=[]
    phase=r.random()*6
    for x in range(x0, x1+step, step):
        y=y0 - amp*(0.5+0.5*math.sin(x/260+phase))*(0.6+0.4*math.sin(x/97+phase*2)) - r.random()*amp*0.12
        pts.append(f'{x},{y:.1f}')
    d='M'+' L'.join(pts)+f' L{x1},{HOR+60} L{x0},{HOR+60} Z'
    f=f' filter="url(#{blur})"' if blur else ''
    a(f'<path d="{d}" fill="{color}" opacity="{op}"{f}/>')
ridge(HOR-38, 22, '#9fadb4', .8, 1180, W, seed=4, blur='blur3')
# sea glitter under sun
for i in range(60):
    x=1790+random.gauss(0,120); y=HOR-30+random.random()*26
    a(f'<rect x="{x:.0f}" y="{y:.0f}" width="{random.randint(8,40)}" height="2" fill="#fff6dc" opacity="{random.uniform(.3,.8):.2f}"/>')
# mountains left (Yuzuruha range), layered
def mountain(pts, color, op, blur=None):
    d='M'+' L'.join(f'{x},{y}' for x,y in pts)+' Z'
    f=f' filter="url(#{blur})"' if blur else ''
    a(f'<path d="{d}" fill="{color}" opacity="{op}"{f}/>')
def smooth_mtn(x0,x1,base,peaks,seed,color,op,blur=None):
    r=random.Random(seed); pts=[(x0,base)]
    for x in range(x0,x1+1,20):
        h=0
        for (px,ph,pw) in peaks: h=max(h, ph*math.exp(-((x-px)/pw)**2))
        h+= r.uniform(-4,4)
        pts.append((x, round(base-h,1)))
    pts.append((x1,base)); mountain(pts,color,op,blur)
smooth_mtn(0,1500,HOR+10,[(180,300,380),(620,250,300),(1000,150,260),(1350,60,200)],11,'#93a4ad',.75,'blur3')
smooth_mtn(0,1300,HOR+20,[(80,220,300),(460,175,260),(820,110,230),(1150,40,180)],12,'#6f877f',.9)
smooth_mtn(0,1100,HOR+30,[(0,140,260),(330,95,210),(700,45,200)],13,'#55705a',1)
# plain base
a(f'<rect x="0" y="{HOR}" width="{W}" height="{H-HOR}" fill="url(#ground)"/>')
# far patchwork fields (thin bands near horizon)
r=random.Random(21)
y=HOR
cols=['#9aa65e','#a88c5a','#b7a563','#7f9a4f','#c2a36a','#8fa257','#a07d52']
while y<690:
    hgt=4+ (y-HOR)*0.12 + r.random()*3
    x=0
    while x<W:
        w=r.randint(120,420)
        a(f'<rect x="{x}" y="{y:.1f}" width="{w+1}" height="{hgt+0.6:.1f}" fill="{r.choice(cols)}" opacity=".95"/>')
        x+=w
    y+=hgt
FAR=y
# hedgerows / tree lines at mid distance
for i in range(26):
    cx=r.randint(0,W); cy=r.uniform(HOR+8,FAR-6); s=r.uniform(.6,1.6)
    for k in range(6):
        a(f'<ellipse cx="{cx+k*14*s:.0f}" cy="{cy-r.uniform(0,6)*s:.0f}" rx="{12*s:.1f}" ry="{9*s:.1f}" fill="#3d5634" opacity=".85"/>')
# houses (small farmhouses, tile roofs)
for cx,cy,s in [(760,HOR+38,1.0),(1080,HOR+30,.8),(2280,HOR+42,1.1),(420,HOR+50,1.2)]:
    w=46*s; h=18*s
    a(f'<rect x="{cx:.0f}" y="{cy:.0f}" width="{w:.0f}" height="{h:.0f}" fill="#e9dcc4"/>')
    a(f'<path d="M{cx-6*s:.0f},{cy:.0f} L{cx+w/2:.0f},{cy-12*s:.0f} L{cx+w+6*s:.0f},{cy:.0f} Z" fill="#474c55"/>')
# foreground rows converging to VP
rows=[]
SP=150
xs=[ -11000 + i*SP for i in range(int(25000/SP)+1)]
N=len(xs)-1
for i in range(N):
    xl,xr=xs[i],xs[i+1]
    soil = (i%2==0)
    col = '#7b5f3f' if soil else r.choice(['#4f7a2f','#5a8434','#4a7230'])
    d=f'M{VP[0]},{VP[1]} L{xl:.0f},{H} L{xr:.0f},{H} Z'
    rows.append((xl,xr,soil))
    a(f'<path d="{d}" fill="{col}" clip-path="url(#fg)"/>')
    if soil:
        m1=xl+(xr-xl)*0.42; m2=xl+(xr-xl)*0.58
        a(f'<path d="M{VP[0]},{VP[1]} L{m1:.0f},{H} L{m2:.0f},{H} Z" fill="#5e452c" opacity=".55" clip-path="url(#fg)"/>')
a(f'<clipPath id="fg"><rect x="0" y="{FAR}" width="{W}" height="{H-FAR}"/></clipPath>')
# light variation over rows
a(f'<rect x="0" y="{FAR}" width="{W}" height="{H-FAR}" fill="url(#warm)"/>')
# onion plants along green rows: leaf strokes
def plant(x,y,s,rr):
    n=rr.randint(4,7)
    for k in range(n):
        ang=rr.uniform(-1.0,1.0)
        L=rr.uniform(26,48)*s
        ex=x+math.sin(ang)*L; ey=y-math.cos(ang)*L
        cx=x+math.sin(ang*0.4)*L*0.5; cy=y-L*0.75
        c=rr.choice(['#6f9a3a','#80aa44','#5f8a32','#9cc259'])
        a(f'<path d="M{x:.1f},{y:.1f} Q{cx:.1f},{cy:.1f} {ex:.1f},{ey:.1f}" stroke="{c}" stroke-width="{max(1.2,2.6*s):.1f}" fill="none" stroke-linecap="round"/>')
    # bulb glint
    a(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{4*s:.1f}" ry="{2.6*s:.1f}" fill="#c9b27a" opacity=".45"/>')
rr=random.Random(5)
for i,(xl,xr,soil) in enumerate(rows):
    if soil: continue
    t=FAR+6
    while t<H+40:
        f=(t-VP[1])/(H-VP[1])        # 0 at VP, 1 at bottom
        xm = VP[0] + ((xl+xr)/2 - VP[0])*f
        rowW = (xr-xl)*f
        s = 0.18 + f*1.25
        for k in range(2):
            x = xm + rr.uniform(-0.3,0.3)*rowW
            if -60<x<W+60: plant(x,t,s,rr)
        t += 6 + f*f*46
# onion drying huts (吊り小屋) mid-distance right
def hut(x,y,s):
    w=150*s; h=78*s
    a(f'<rect x="{x:.0f}" y="{y-h:.0f}" width="{w:.0f}" height="{h:.0f}" fill="#2f2a22" opacity=".35"/>')
    # hanging onion bundles
    for col in range(int(10*s)+6):
        bx=x+8*s+col*(w-16*s)/(int(10*s)+5)
        for row in range(4):
            by=y-h+12*s+row*15*s
            a(f'<ellipse cx="{bx:.1f}" cy="{by:.1f}" rx="{4.2*s:.1f}" ry="{6*s:.1f}" fill="{random.choice(["#c98b3c","#d9a150","#b8782e"])}"/>')
    # posts
    for px in (x, x+w/2, x+w):
        a(f'<rect x="{px-2*s:.1f}" y="{y-h:.0f}" width="{4*s:.1f}" height="{h:.0f}" fill="#3b3228"/>')
    # roof
    a(f'<path d="M{x-18*s:.0f},{y-h:.0f} L{x+w*0.5:.0f},{y-h-34*s:.0f} L{x+w+18*s:.0f},{y-h:.0f} Z" fill="#3a3f45"/>')
    a(f'<path d="M{x-18*s:.0f},{y-h:.0f} L{x+w+18*s:.0f},{y-h:.0f}" stroke="#23262a" stroke-width="{3*s:.1f}"/>')
    # shadow
    a(f'<ellipse cx="{x+w/2:.0f}" cy="{y+2*s:.0f}" rx="{w*0.62:.0f}" ry="{7*s:.0f}" fill="#1e2a16" opacity=".35"/>')
hut(1880, FAR+34, 0.75)
hut(2130, FAR+58, 1.0)
hut(1650, FAR+18, 0.5)
a(f'<linearGradient id="depth" x1="0" y1="{FAR}" x2="0" y2="{FAR+260}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9d9a8" stop-opacity=".55"/><stop offset="1" stop-color="#e9d9a8" stop-opacity="0"/></linearGradient>')
a(f'<rect x="0" y="{FAR}" width="{W}" height="260" fill="url(#depth)"/>')
# atmospheric haze at horizon
a(f'<rect x="0" y="{HOR-90}" width="{W}" height="220" fill="url(#haze)"/>')
# warm sun wash over whole image
a(f'<rect width="{W}" height="{H}" fill="url(#sun)" opacity=".45" style="mix-blend-mode:soft-light"/>')
# grain
a(f'<rect width="{W}" height="{H}" filter="url(#grain)" fill="#fff"/>')
a('</svg>')
open('hero.svg','w').write('\n'.join(out))
print(len(out))
