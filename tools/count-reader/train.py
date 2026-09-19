# Teaches the network in js/count-net.js to read a slot's count.
#
# A small convolutional net over the lower half of a slot, a row of
# eleven scores every two pixels along it, trained with CTC -- so nothing
# ever has to say where one figure stops and the next begins, which on
# eight-pixel writing over a drawing nothing reliably can. It is taught
# on gen.py's made-up slots alone. Real slots (real.bin / real.json, cut
# by the app's own countPatch from screenshots whose numbers were read
# by eye) are optional and only ever looked at, never learnt from,
# unless --real names some: they are how to tell that what it learnt on
# made-up slots is true of the game's.
#
# See gen.py for the whole run.
import json, sys, time, argparse, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
ap=argparse.ArgumentParser()
ap.add_argument('--ch',default='16,32,64'); ap.add_argument('--epochs',type=int,default=10)
ap.add_argument('--real',default='');   # substrings of shots whose patches may be trained on
ap.add_argument('--out',default='model'); ap.add_argument('--n',type=int,default=300000)
ap.add_argument('--bs',type=int,default=256); ap.add_argument('--lr',type=float,default=3e-3)
a=ap.parse_args()
torch.manual_seed(1); torch.set_num_threads(10)
c1,c2,c3=map(int,a.ch.split(','))
class Net(nn.Module):
    def __init__(s):
        super().__init__()
        def cb(i,o,k=3,p=1): return nn.Sequential(nn.Conv2d(i,o,k,padding=p,bias=False),nn.BatchNorm2d(o),nn.ReLU(inplace=True))
        s.f=nn.Sequential(cb(3,c1),cb(c1,c1),nn.MaxPool2d((2,2)),cb(c1,c2),cb(c2,c2),nn.MaxPool2d((2,1)),cb(c2,c3),nn.MaxPool2d((2,1)),
            cb(c3,c3,(4,3),(0,1)),nn.Conv2d(c3,11,1))
    def forward(s,x): return s.f(x).squeeze(2)   # B,11,T
def load(name):
    L=json.load(open(name+'.json')); X=np.fromfile(name+'.bin',dtype=np.uint8).reshape(-1,3,32,64); return X,L
SX,SL=load('synth'); SX=SX[:a.n]; SL=SL[:a.n]
import os
if os.path.exists('real.json'): RX,RM=load('real')
else: RX,RM=np.zeros((0,3,32,64),np.uint8),[]
RL=[m['label'] for m in RM]
tr=[i for i,m in enumerate(RM) if a.real and any(t in m['shot'] for t in a.real.split(','))]
te=[i for i,m in enumerate(RM) if m['k']==0 and i not in set(tr)]
te_all=[i for i,m in enumerate(RM) if m['k']==0]
print('synth',len(SL),'real train',len(tr),'real test',len(te))
X=SX; L=SL
if tr:
    rep=max(1,int(0.25*len(SL)/len(tr)))   # real is a fifth of every epoch
    X=np.concatenate([SX]+[RX[tr]]*rep); L=SL+[RL[i] for i in tr]*rep
X=torch.from_numpy(X); N=len(L)
lab=[torch.tensor([int(ch)+1 for ch in s],dtype=torch.long) for s in L]
net=Net(); print('params',sum(p.numel() for p in net.parameters()))
steps=a.epochs*(N//a.bs); opt=torch.optim.AdamW(net.parameters(),lr=a.lr,weight_decay=1e-4)
sched=torch.optim.lr_scheduler.OneCycleLR(opt,max_lr=a.lr,total_steps=steps,pct_start=0.1)
def decode(logits):
    p=logits.softmax(1); conf,arg=p.max(1); out=[]
    for b in range(arg.shape[0]):
        s=[];prev=0
        for t in arg[b].tolist():
            if t!=prev and t!=0: s.append(str(t-1))
            prev=t
        out.append((''.join(s),conf[b].min().item()))
    return out
def evaluate(idx,show=False):
    net.eval(); res=[]
    with torch.no_grad():
        for i in range(0,len(idx),512):
            j=idx[i:i+512]; res+=decode(net(torch.from_numpy(RX[j]).float()/255))
    net.train()
    ok=sum(1 for k,(s,c) in zip(idx,res) if s==RL[k]); num=[k for k in idx if RL[k]]
    okn=sum(1 for k,(s,c) in zip(idx,res) if RL[k] and s==RL[k])
    bad=[(RM[k]['shot'][-10:-4],RM[k]['row'],RM[k]['col'],RL[k],s,round(c,2)) for k,(s,c) in zip(idx,res) if s!=RL[k]]
    return ok,len(idx),okn,len(num),bad
t0=time.time(); step=0
for ep in range(a.epochs):
    perm=torch.randperm(N)
    for i in range(0,N-a.bs+1,a.bs):
        j=perm[i:i+a.bs]; x=X[j].float()/255
        y=[lab[k] for k in j.tolist()]
        lp=net(x).log_softmax(1).permute(2,0,1)   # T,B,C
        tl=torch.tensor([len(t) for t in y]); 
        loss=F.ctc_loss(lp,torch.cat(y) if tl.sum()>0 else torch.zeros(0,dtype=torch.long),torch.full((len(y),),lp.shape[0],dtype=torch.long),tl,zero_infinity=True)
        opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(),5); opt.step(); sched.step(); step+=1
        if step%200==0: print(f'ep {ep} step {step}/{steps} loss {loss.item():.4f} {time.time()-t0:.0f}s',flush=True)
    ok,n,okn,nn_,bad=evaluate(te if te else te_all)
    print(f'== epoch {ep}: real held-out exact {ok}/{n}, numbered {okn}/{nn_}',flush=True)
    torch.save(net.state_dict(),a.out+'.pt')
ok,n,okn,nn_,bad=evaluate(te if te else te_all)
print('FINAL held-out',ok,n,okn,nn_); 
for b in bad: print(b)
# and on made-up slots it was not taught on
TX,TL=load('synthtest'); net.eval(); hit=0; num=0; numhit=0; sure_wrong=0
with torch.no_grad():
    for i in range(0,len(TL),1000):
        for (s,c),l in zip(decode(net(torch.from_numpy(TX[i:i+1000]).float()/255)),TL[i:i+1000]):
            hit+=s==l; num+=bool(l); numhit+=bool(l) and s==l
print(f'SYNTH TEST exact {hit}/{len(TL)} numbered {numhit}/{num}')
