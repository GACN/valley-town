import bpy, os, sys, re, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gugong.blend'))
cnt = collections.Counter()
for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    p = ob.name.split('_')[0]
    cnt[ob.name] += 1
print('OBJ_TOTAL', sum(cnt.values()))
pref = collections.Counter()
for ob in bpy.data.objects:
    if ob.type == 'MESH':
        pref[ob.name.split('_')[0]] += 1
for k, v in pref.most_common(30):
    print('PREFIX %-16s %d' % (k, v))
print('--- 前 80 个对象名 ---')
for ob in list(bpy.data.objects)[:80]:
    if ob.type == 'MESH':
        print('N', ob.name)
