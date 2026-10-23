const {test}=require('node:test');const assert=require('node:assert/strict');const {calculate}=require('../server');
const find=(r,name)=>r.find(x=>x.label===name).amount;
test('muro 20 y 30 cm',()=>{assert.equal(find(calculate('muro',{largo:2,alto:3,espesor:20}),'Ladrillos'),540);assert.ok(Math.abs(find(calculate('muro',{largo:2,alto:3,espesor:30}),'Cemento')-91.2)<1e-9);});
test('viga y columna',()=>{assert.equal(find(calculate('viga',{largo:5}),'Cemento'),45);assert.equal(find(calculate('columna',{largo:4}),'Hierro Ø 10'),24);});
test('contrapiso en centímetros',()=>assert.equal(find(calculate('contrapiso',{espesor:10,ancho:2,largo:5}),'Cemento'),105));
test('techo por m2',()=>assert.equal(find(calculate('techo',{espesor:12,ancho:2,largo:5}),'Cemento'),330));
test('pisos y pintura',()=>{assert.equal(find(calculate('pisos',{ancho:2,largo:5}),'Superficie total'),11);assert.equal(find(calculate('pintura',{superficie:24}),'Pintura necesaria'),4);});
