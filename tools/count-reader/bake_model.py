# The trained network, folded and written out as the module the app carries.
import os, sys, json, base64, numpy as np, torch
sd=torch.load(sys.argv[1],map_location='cpu'); out=sys.argv[2]
note=sys.argv[3] if len(sys.argv)>3 else ''
# the Sequential's layout: conv/bn/relu blocks, pools, final 1x1
seq=[('cb',0),('cb',1),('pool',2,2),('cb',3),('cb',4),('pool',2,1),('cb',6),('pool',2,1),('cb',8),('last',9)]
layers=[]
def q(W,b,relu,pad):
    co,ci,kh,kw=W.shape; flat=W.reshape(co,-1)
    scale=np.maximum(np.abs(flat).max(1),1e-8)/127.0
    qi=np.clip(np.round(flat/scale[:,None]),-127,127).astype(np.int8)
    return {'kind':'conv','cin':ci,'cout':co,'kh':kh,'kw':kw,'ph':pad[0],'pw':pad[1],'relu':relu,
            'scale':[float(f'{s:.6g}') for s in scale],'b':[float(f'{v:.6g}') for v in b],'w':base64.b64encode(qi.tobytes()).decode()}
for item in seq:
    if item[0]=='pool': layers.append({'kind':'pool','ph':item[1],'pw':item[2]}); continue
    i=item[1]
    if item[0]=='cb':
        W=sd[f'f.{i}.0.weight'].numpy(); g=sd[f'f.{i}.1.weight'].numpy(); be=sd[f'f.{i}.1.bias'].numpy()
        mu=sd[f'f.{i}.1.running_mean'].numpy(); var=sd[f'f.{i}.1.running_var'].numpy()
        k=g/np.sqrt(var+1e-5); W=W*k[:,None,None,None]; b=be-mu*k
        pad=(0,1) if W.shape[2]==4 else (1,1)
        layers.append(q(W,b,True,pad))
    else:
        layers.append(q(sd[f'f.{i}.weight'].numpy(),sd[f'f.{i}.bias'].numpy(),False,(0,0)))
head=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'model_head.txt')).read()
with open(out,'w') as f:
    f.write(head.replace('@NOTE@',note))
    f.write('export const COUNT_MODEL = { layers: [\n')
    for L in layers: f.write('\t'+json.dumps(L,separators=(',',':'))+',\n')
    f.write('] };\n')
print('wrote',out,sum(len(L.get('w','')) for L in layers),'bytes of weights')
