'use strict'
/*
 * Self-check for the local engine's end-of-tick movement deconfliction.
 * Run: node tools/sim/movement.test.js
 *
 * In Screeps, move/moveTo return OK to register an intent; whether a creep
 * actually changes tiles is resolved at the between-ticks phase. These checks
 * pin the vanilla-like rules the engine mock reproduces.
 */
const engine = require('./engine')
engine.installGlobals()
engine.createWorld()
const world = engine.getWorld()

let failures = 0
function fake(name, x, y, intent) {
    return { name, spawning: false, _moved: false, _stepsThisLife: 0, pos: { x, y }, _intent: intent }
}
function run(creeps) {
    world.creeps = {}
    for (const c of creeps) world.creeps[c.name] = c
    world.resolveMovement()
}
function at(c, x, y, moved) {
    const ok = c.pos.x === x && c.pos.y === y && (moved === undefined || c._moved === moved)
    if (!ok) { failures++; console.log(`  FAIL ${c.name}: got @${c.pos.x},${c.pos.y} moved=${c._moved}, expected @${x},${y} moved=${moved}`) }
    return ok
}

// 1) stationary creep blocks a mover (no shoving)
let A = fake('A', 5, 5, { x: 6, y: 5, order: 1 }), B = fake('B', 6, 5, null)
run([A, B]); at(A, 5, 5, false); at(B, 6, 5)

// 2) chain into an empty tile: both move
A = fake('A', 5, 5, { x: 6, y: 5, order: 1 }); B = fake('B', 6, 5, { x: 7, y: 5, order: 2 })
run([A, B]); at(A, 6, 5, true); at(B, 7, 5, true)

// 3) head-on swap fails: neither moves
A = fake('A', 5, 5, { x: 6, y: 5, order: 1 }); B = fake('B', 6, 5, { x: 5, y: 5, order: 2 })
run([A, B]); at(A, 5, 5, false); at(B, 6, 5, false)

// 4) contested tile won by earliest issue order
A = fake('A', 5, 5, { x: 6, y: 6, order: 1 }); B = fake('B', 7, 7, { x: 6, y: 6, order: 2 })
run([A, B]); at(A, 6, 6, true); at(B, 7, 7, false)

if (failures) { console.log(`\nmovement.test: ${failures} assertion(s) FAILED`); process.exit(1) }
console.log('movement.test: all movement deconfliction checks passed')
