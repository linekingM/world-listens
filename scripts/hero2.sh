#!/bin/bash
cd "$(dirname "$0")/.."
S=scripts/snap.mjs
node $S P3-noon "?t=12.5"
node $S P3-night "?t=22.2"
node $S P3-meteors "?t=22.5" "" "(()=>{const s=window.__world.getState();s.setWeather('starry');s.setGravity(0)})()" 5000
node $S P3-fireflies "?t=21.5" "" "(()=>{const s=window.__world.getState();s.setWeather('starry')})()" 4000
node $S P3-mist-lanterns "?t=19.9" "" "(()=>{const s=window.__world.getState();s.setWeather('mist')})()" 5000
node $S P3-edit-island "?t=9" "" "(()=>{const s=window.__world.getState();s.select(s.objects.find(o=>o.type==='island').id)})()" 1200
