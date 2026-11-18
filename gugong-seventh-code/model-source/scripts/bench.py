import bpy, time, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_monkey_add(location=(0,0,0))
bpy.ops.object.shade_smooth()
m = bpy.data.materials.new("m"); m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8,0.3,0.2,1)
bpy.context.object.data.materials.append(m)
bpy.ops.object.light_add(type='SUN', location=(3,-3,5)); bpy.context.object.data.energy = 4
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); bpy.context.scene.collection.objects.link(cam)
cam.location = (5,-5,4); cam.rotation_euler = (1.1,0,0.78); bpy.context.scene.camera = cam
s = bpy.context.scene
s.render.resolution_x = 960; s.render.resolution_y = 540
s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'; s.cycles.samples = 32
s.cycles.use_denoising = False
s.render.filepath = '/sdcard/Music/每日归档/2026-11/gugong/scripts/b_cycles.png'
t = time.time(); bpy.ops.render.render(write_still=True)
print("BENCH_CYCLES 960x540 32spp:", round(time.time()-t,2), "s")
