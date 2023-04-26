forfiles /P "C:\Users\Administrator\Documents\LeanPlanner\IFC Conversion" /M *.ifc /C "cmd /c IfcConvert --use-element-guids --strict-tolerance -j 4 @file @fname.glb"

# find /home/ubuntu/Lean/LeanPlanner/IFC Conversion/ -name "*.ifc" -exec echo {}
