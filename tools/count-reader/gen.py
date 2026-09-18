# Made-up storage slots, for teaching the network in js/count-net.js.
#
# The game's own font over this repo's own icons, in a slot drawn the way
# the game draws one, and then everything a screenshot does to it on the
# way to a file: another UI scale, a desktop that scales its screen, a
# blur, a JPEG or two. The label is known because it was written here,
# which is the whole point -- a third of a million labelled slots that
# nobody had to read.
#
# The font is the client's (Strong Sword, ui_data/font/pearl.ttf inside
# the Paz archives) and is not in this repository; pull it out of your
# own install with github.com/iDevelopThings/bdo-data-extractor:
#
#   bdo-data-extractor extract --game "<Black Desert Online>" .ttf fonts
#
# and point FONT at it. Then, in a shell with torch, numpy and pillow
# (nix-shell -p "python3.withPackages(ps: [ps.torch ps.numpy ps.pillow])"):
#
#   python3 gen.py 300000 synth 1000        # the slots it is taught on
#   python3 gen.py 20000 synthtest 5000000  # ones it is not
#   python3 train.py --ch 12,24,48 --epochs 4 --out final
#   python3 bake_model.py final.pt ../../js/count_model.js "<what it scored>"
import os, sys, io, glob, json, random, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from multiprocessing import Pool
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')
FONT=os.environ.get('FONT','fonts/ui_data/font/pearl.ttf')
ICONS=sorted(glob.glob(ROOT+'/icons/*.webp'))
GRADES=[(125,125,125),(125,125,125),(96,140,72),(64,124,176),(204,160,52),(200,96,56)]
_icons={}
def icon(i):
    if i not in _icons: _icons[i]=Image.open(ICONS[i]).convert('RGBA')
    return _icons[i]
_fonts={}
def font(px):
    px=max(6,int(round(px)))
    if px not in _fonts: _fonts[px]=ImageFont.truetype(FONT,px)
    return _fonts[px]
# digit height as a share of the em, measured once
_f=font(200); _b=_f.getbbox('0'); EM_H=(_b[3]-_b[1])/200.0

def number(r):
    n=r.choices([1,2,3,4,5,6,7],weights=[22,34,22,12,6,3,1])[0]
    s=str(r.randint(1,9))+''.join(str(r.randint(0,9)) for _ in range(n-1))
    if r.random()<0.12 and n>1: s=s[0]+r.choice('01')*(n-1)       # 100, 1000, 111
    if r.random()<0.08: s=''.join(r.choice('17') for _ in range(n))  # the thin ones
    if s[0]=='0': s='1'+s[1:]
    return s

def sample(seed):
    r=random.Random(seed)
    p=r.choice([r.uniform(26,40),r.uniform(36,70),r.uniform(36,70),r.uniform(60,96)]); SS=4; P=int(round(p*SS))
    gap=r.randint(26,50); im=Image.new('RGB',(P,P),(gap,gap,gap+r.randint(0,6)))
    d=ImageDraw.Draw(im)
    side=r.uniform(0.85,0.90)*P; off=(P-side)/2+r.uniform(-0.01,0.01)*P
    g=GRADES[r.randrange(len(GRADES))]; k=r.uniform(0.6,1.15); g=tuple(min(255,int(c*k)) for c in g)
    inner=r.randint(8,30)
    bw=max(1,int(round(SS*p/45*r.uniform(0.8,1.3))))
    d.rectangle([off,off,off+side,off+side],fill=(inner,inner,inner+r.randint(0,5)),outline=g,width=bw)
    label=''
    has_icon=r.random()<0.88
    if has_icon:
        ic=icon(r.randrange(len(ICONS)))
        s=int(round(r.uniform(0.76,0.84)*P))
        ic=ic.resize((s,s),Image.BICUBIC)
        if r.random()<0.5: ic=ic.transpose(Image.FLIP_LEFT_RIGHT)
        if r.random()<0.3: ic=ic.rotate(r.choice([90,180,270]))
        im.paste(ic,(int((P-s)/2+r.uniform(-0.01,0.01)*P),int((P-s)/2+r.uniform(-0.01,0.01)*P)),ic)
        if r.random()<0.12:   # bright clutter where a count would be
            d=ImageDraw.Draw(im)
            for _ in range(r.randint(1,3)):
                x=r.uniform(0.3,0.85)*P; y=r.uniform(0.55,0.9)*P; c=r.randint(170,255)
                if r.random()<0.5: d.line([x,y,x+r.uniform(-0.05,0.05)*P,y+r.uniform(0.1,0.25)*P],fill=(c,c,c),width=max(1,int(SS*r.uniform(0.8,2))))
                else: d.ellipse([x,y,x+r.uniform(0.05,0.15)*P,y+r.uniform(0.05,0.15)*P],fill=(c,c,c))
    if has_icon and r.random()<0.62:
        label=number(r)
        hfrac=r.uniform(0.172,0.228)
        f=font(hfrac*P/EM_H)
        track=r.uniform(-0.004,0.02)*P
        widths=[f.getlength(ch) for ch in label]
        total=sum(widths)+track*(len(label)-1)
        right=P-r.uniform(0.155,0.22)*P; base=P-r.uniform(0.125,0.19)*P
        # a count that would run off the slot is drawn smaller by nobody: skip it
        if right-total<0.02*P: label=label[-3:]; widths=widths[-3:]; total=sum(widths)+track*(len(label)-1)
        asc=f.getbbox('0')[3]
        def draw(layer,fill,stroke=0):
            dd=ImageDraw.Draw(layer); x=right-total
            for ch,wd in zip(label,widths):
                dd.text((x,base-asc),ch,font=f,fill=fill,stroke_width=stroke,stroke_fill=fill); x+=wd+track
        sh=Image.new('L',(P,P),0)
        draw(sh,int(255*r.uniform(0.55,1.0)),stroke=int(round(SS*p/45*r.uniform(0.5,1.4))))
        sh=sh.filter(ImageFilter.GaussianBlur(SS*p/45*r.uniform(0.25,0.9)))
        ox,oy=int(SS*r.uniform(0,0.8)),int(SS*r.uniform(0,0.8))
        black=Image.new('RGB',(P,P),(0,0,0)); im.paste(black,(ox,oy),sh)
        tx=Image.new('L',(P,P),0); draw(tx,int(255*r.uniform(0.85,1.0)),stroke=int(r.random()<0.6)*int(round(SS*p/45*r.uniform(0.15,0.4))))
        c=r.randint(196,252); col=(c,c-r.randint(0,8),c-r.randint(0,14))
        im.paste(Image.new('RGB',(P,P),col),(0,0),tx)
    # down to the size the game drew it at
    n=max(8,int(round(p)))
    im=im.resize((n,n),r.choice([Image.LANCZOS,Image.BOX,Image.BICUBIC]))
    def jpeg(im):
        b=io.BytesIO(); im.save(b,'JPEG',quality=r.randint(28,95),subsampling=r.choice([0,2])); b.seek(0); return Image.open(b).convert('RGB')
    if r.random()<0.4: im=im.filter(ImageFilter.GaussianBlur(r.uniform(0.2,1.1)))
    if r.random()<0.3: im=jpeg(im)
    if r.random()<0.55:   # a capture that was scaled on its way to the file
        fct=r.choice([1.25,1.25,1.5,1.75,2.0,r.uniform(0.7,2.2)])
        m=max(8,int(round(n*fct))); im=im.resize((m,m),r.choice([Image.BILINEAR,Image.BICUBIC,Image.LANCZOS])); n=m
        if r.random()<0.3: im=jpeg(im)
    # the lower half, cut the way the app cuts it, a little off
    z=r.uniform(0.95,1.05); sidepx=n*z
    cx=n/2+r.uniform(-0.05,0.05)*n; cy=n/2+r.uniform(-0.05,0.05)*n
    x0=cx-sidepx/2; y0=cy+n/2-sidepx/2
    big=Image.new('RGB',(n*3,n*3),(gap,gap,gap)); big.paste(im,(n,n))
    # neighbours, so the edge of the patch is not always flat
    if r.random()<0.7:
        for ddx,ddy in [(-1,0),(1,0),(0,1)]: big.paste(im.transpose(Image.FLIP_LEFT_RIGHT) if ddx else im.transpose(Image.FLIP_TOP_BOTTOM),(n+ddx*n,n+ddy*n))
    box=(x0+n,y0+n,x0+n+sidepx,y0+n+sidepx/2)
    patch=big.resize((64,32),r.choice([Image.BILINEAR,Image.BILINEAR,Image.BICUBIC,Image.BOX]),box=box)
    a=np.asarray(patch).astype(np.float32)
    a=a*r.uniform(0.85,1.15)+r.uniform(-10,10)
    if r.random()<0.4: a+=np.random.RandomState(seed).normal(0,r.uniform(1,5),a.shape)
    a=np.clip(a,0,255).astype(np.uint8).transpose(2,0,1)
    return a,label

def work(args):
    lo,hi=args; out=[];lab=[]
    for s in range(lo,hi):
        a,l=sample(s); out.append(a); lab.append(l)
    return np.stack(out),lab

if __name__=='__main__':
    N=int(sys.argv[1]); name=sys.argv[2]; base=int(sys.argv[3]) if len(sys.argv)>3 else 0
    step=2000; jobs=[(base+i,base+min(N,i+step)) for i in range(0,N,step)]
    with Pool(10) as pool: res=pool.map(work,jobs)
    X=np.concatenate([r[0] for r in res]); L=sum([r[1] for r in res],[])
    X.tofile(name+'.bin'); json.dump(L,open(name+'.json','w'))
    print(X.shape,len(L),sum(1 for l in L if l)/len(L))
    if N<=200:
        W=Image.new('RGB',(64*3*6,32*3*10))
        for i in range(min(60,N)): W.paste(Image.fromarray(X[i].transpose(1,2,0)).resize((192,96),Image.NEAREST),((i%6)*192,(i//6)*96))
        W.save(name+'.png'); print(L[:60])
