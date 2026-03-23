@echo off
cd /d C:\Users\Usuario\Documents\GitHub\VoxelBIM
git add app/autodesk.html aps-worker/index.js
git commit -m "feat: claude proxy via worker"
git push
echo DONE
