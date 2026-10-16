#!/bin/bash
# Best-of screenshot set → shots/best/
cd "$(dirname "$0")/.."
S=scripts/snap.mjs
node $S best/01-morning "?t=8"
node $S best/02-sunset "?t=18.5"
node $S best/03-night-fireflies "?t=21.6" "" "(()=>{window.__world.getState().setWeather('starry')})()" 4000
node $S best/04-weather-mist-dawn "?t=7" "" "(()=>{window.__world.getState().setWeather('mist')})()" 5000
node $S best/05-edit-island "?t=9.5" "" "(()=>{const s=window.__world.getState();s.select(s.objects.find(o=>o.type==='island').id)})()" 1200
node $S best/06-gravity-weightless "?t=17" "" "(()=>{const s=window.__world.getState();s.setGravity(0)})()" 4000
node $S best/07-surprise-meteors "?t=22.5" "" "(()=>{const s=window.__world.getState();s.setWeather('starry');s.setGravity(0)})()" 5000
node $S best/08-mobile-home "?t=17.8" m
node $S best/09-mobile-edit "?t=10" m "(()=>{const s=window.__world.getState();s.select(s.objects.find(o=>o.type==='house').id)})()" 1000
node $S best/10-wind-gust "?t=17.8" "" "(()=>{const s=window.__world.getState();let k=0;setInterval(()=>{k++;s.setTime(17.6+0.4*Math.abs(Math.sin(k*0.5)))},120)})()" 9000
