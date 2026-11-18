import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gugong.blend'))

# 50m 网格占用统计（只看 z>0.5 的屋顶体量，忽略地面/河）
CELL = 50.0
X0, X1 = -390, 390
Y0, Y1 = -425, 570
nx = int((X1 - X0) / CELL); ny = int((Y1 - Y0) / CELL)
grid = [[0] * nx for _ in range(ny)]
for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    n = ob.name
    if n.startswith(('GROUND', 'PLAZA', 'MOAT', 'PLAN')):
        continue
    bb = [ob.matrix_world @ v.co for v in ob.data.vertices]
    if not bb:
        continue
    zs = max(v.z for v in bb)
    if zs < 0.8:      # 铺地/河/散水，不算体量
        continue
    for v in bb:
        i = int((v.x - X0) / CELL); j = int((v.y - Y0) / CELL)
        if 0 <= i < nx and 0 <= j < ny:
            grid[j][i] += 1

print('GRID 50m cells occupied: %d / %d = %.0f%%' % (
    sum(1 for r in grid for c in r if c), nx * ny,
    100.0 * sum(1 for r in grid for c in r if c) / (nx * ny)))
# 按 4 象限分区统计
for name, xs, ys in [('西南', (-390, 0), (-425, 70)), ('东南', (0, 390), (-425, 70)),
                     ('西北', (-390, 0), (70, 570)), ('东北', (0, 390), (70, 570))]:
    tot = occ = 0
    for j in range(ny):
        cy = Y0 + (j + 0.5) * CELL
        if not (ys[0] < cy < ys[1]):
            continue
        for i in range(nx):
            cx = X0 + (i + 0.5) * CELL
            if not (xs[0] < cx < xs[1]):
                continue
            tot += 1
            if grid[j][i]:
                occ += 1
    print('QUAD %s occupied %d/%d = %.0f%%' % (name, occ, tot, 100.0 * occ / max(1, tot)))

# ASCII 图（每格 1 字符，行=北→南）
print('\nMAP (北在上, 每格50m, .空 #>=1 *>=3 @>=6)')
for j in range(ny - 1, -1, -1):
    row = ''
    for i in range(nx):
        c = grid[j][i]
        row += '.' if c == 0 else ('#' if c < 3 else ('*' if c < 6 else '@'))
    print('%5d %s' % (int(Y0 + (j + 0.5) * CELL), row))
