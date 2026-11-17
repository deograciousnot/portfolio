#!/usr/bin/env bash
# Overnight: wait for the still to finish, render the 240-frame loop, then encode it.
# Safe to re-run: frames already rendered are skipped.
B="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
D="C:/Users/kipro/Desktop/portfolio/blender"
while tasklist //FI "IMAGENAME eq blender.exe" | grep -qi blender.exe; do sleep 30; done
mkdir -p "$D/frames"
"$B" -b -P "$D/magneto.py" -- anim "$D/frames/magneto_####" 2>&1 | grep -E "Saved:|Error|Traceback" | tail -n 3
"$B" -b -P "$D/encode.py" -- "$D/frames" "C:/Users/kipro/Desktop/portfolio/img/magneto-explode.mp4" 2>&1 | grep -E "ENCODED|Error|Traceback"
