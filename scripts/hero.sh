#!/bin/bash
# Hero screenshots of the full build (production preview on :4173)
cd "$(dirname "$0")/.."
S=scripts/snap.mjs
node $S P2-morning "?t=8"
node $S P2-noon "?t=12.5"
node $S P2-sunset "?t=18.5"
node $S P2-night "?t=22.2"
node $S P2-edit-island "?t=9" "" "(()=>{const s=window.__world.getState();s.select(s.objects.find(o=>o.type==='island').id)})()" 1200
node $S P2-edit-placing "?t=16.5" "" "(()=>{const s=window.__world.getState();s.setPlacing('tower');})()" 600
node $S P2-gravity-weightless "?t=16.8" "" "(()=>{const s=window.__world.getState();s.setGravity(0)})()" 4000
node $S P2-gravity-reversed-orbit "?t=19.6" "" "(()=>{const s=window.__world.getState();s.setGravity(-0.6);s.setOrbit(true)})()" 5000
node $S P2-cloudy "?t=11" "" "(()=>{window.__world.getState().setWeather('cloudy')})()" 5000
node $S P2-mist "?t=7.2" "" "(()=>{window.__world.getState().setWeather('mist')})()" 5000
node $S P2-morning-mobile "?t=8" m
node $S P2-sunset-mobile "?t=18.5" m
node $S P2-edit-mobile "?t=10" m "(()=>{const s=window.__world.getState();s.select(s.objects.find(o=>o.type==='house').id)})()" 1000
node $S P2-panel-gravity-mobile "?t=17" m "(()=>{const s=window.__world.getState();s.setPanel('gravity');s.setGravity(0.45)})()" 3000
HINT=1 node $S P2-first-visit "?t=8"
