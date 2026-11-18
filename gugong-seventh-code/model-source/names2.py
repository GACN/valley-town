import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gugong.blend'))
names = [o.name for o in bpy.data.objects if o.type == 'MESH']
import re
pat = re.compile(r'(bridge|qiao|ramp|qiao|arch|stair|step|lift|wall|lang|corr|cap|ding|zheng|dun|tai)', re.I)
hit = sorted({n for n in names if pat.search(n)})
print('HITS', len(hit))
for n in hit[:60]:
    print('H', n)
print('--- 所有前缀=非 THD/BHD/ZHD 的对象名 ---')
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    if o.name.split('_')[0] in ('THD', 'BHD', 'ZHD'):
        continue
    print('O', o.name)
