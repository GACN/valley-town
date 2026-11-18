import bpy, os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gugong.blend'))

def kind(n):
    t = n.split('_')
    if len(t) >= 2:
        return t[1]
    return t[0]

c = collections.Counter()
for ob in bpy.data.objects:
    if ob.type == 'MESH':
        c[kind(ob.name)] += 1
print('KINDS', len(c))
for k, v in c.most_common(60):
    print('KIND %-14s %d' % (k, v))

# 各 kind 的 z 范围和典型名，用于判断是瓦/墙/柱/台基
import mathutils
agg = {}
for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    k = kind(ob.name)
    vs = ob.data.vertices
    if not vs:
        continue
    z0 = min(v.co.z for v in vs) + ob.location.z
    z1 = max(v.co.z for v in vs) + ob.location.z
    a = agg.setdefault(k, [1e9, -1e9, ob.name, 0])
    a[0] = min(a[0], z0); a[1] = max(a[1], z1); a[3] += 1
print('--- kind z 范围 ---')
for k, a in sorted(agg.items(), key=lambda x: -x[1][3])[:40]:
    print('Z %-14s n=%-5d z=%.1f..%.1f  ex=%s' % (k, a[3], a[0], a[1], a[2]))
