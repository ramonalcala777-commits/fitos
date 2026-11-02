import {useState} from 'react';
import {calculateDose,doseUnit} from '../lib/dose.mjs';
const number=(n:number)=>n.toLocaleString('es-ES',{maximumFractionDigits:5});
function DoseForm({use,generalConditions}:{use:any;generalConditions:string}){
 const initial=doseUnit(use['Unidad Medida dosis']);
 const[amount,setAmount]=useState(''),[volume,setVolume]=useState(''),[unit,setUnit]=useState<string>(initial?.unit||'l'),[basis,setBasis]=useState(''),[extraMax,setExtraMax]=useState('');
 const result=calculateDose(use,{amount,volume,inputUnit:unit,percentBasis:basis,extraMax,generalConditions});
 const low=use.Dosis_Min===use.Dosis_Max?number(use.Dosis_Min):number(use.Dosis_Min)+'–'+number(use.Dosis_Max);
 const checked=result.ready&&result.checkable?result:null;
 const incomplete=!checked;
 const danger=checked&&(checked.overLimit||checked.belowLimit||['above','below'].includes(checked.waterStatus));
 const pending=checked&&(checked.reviewDose||checked.waterStatus==='unknown'||checked.percent);
 const title=!checked?'Pendiente de comprobación':checked.overLimit?'NO CUMPLE · supera el máximo de dosis':checked.belowLimit?'NO CUMPLE · por debajo de la dosis mínima':['above','below'].includes(checked.waterStatus)?'NO CUMPLE · volumen de caldo fuera del intervalo':pending?'Dosis dentro del intervalo · revisar condiciones':'CUMPLE · dosis y volumen dentro de los intervalos';
 return <>
 <p className="calc-official">Dosis oficial: <strong>{low} {use['Unidad Medida dosis']||'Unidad no indicada'}</strong><br/>Caldo indicado: <strong>{use['Volumen Caldo']||'No publicado como intervalo de caldo'}</strong></p>
 {use.CondicionamientoEspecifico&&<details className="calc-conditions"><summary>Condiciones de este uso</summary><p>{use.CondicionamientoEspecifico}</p></details>}
 <div className="calc-fields"><label>Producto por 1.000 litros<div className="calc-amount"><input aria-label="Cantidad de producto por 1.000 litros" inputMode="decimal" value={amount} placeholder="Ej. 0,75" onChange={e=>setAmount(e.target.value)}/><select aria-label="Unidad de producto" value={unit} onChange={e=>setUnit(e.target.value)}><option value="l">litros</option><option value="ml">mililitros</option><option value="kg">kg</option><option value="g">gramos</option></select></div></label><label>Volumen de caldo aplicado (l/ha)<input aria-label="Volumen de caldo aplicado en litros por hectárea" inputMode="decimal" value={volume} placeholder="Ej. 1.000 → escribir 1000" onChange={e=>setVolume(e.target.value)}/></label></div>
 {use['Unidad Medida dosis']==='%'&&<label className="calc-label">Base del porcentaje indicada en la etiqueta<select aria-label="Base del porcentaje" value={basis} onChange={e=>setBasis(e.target.value)}><option value="">Seleccionar según etiqueta</option><option value="volume">Volumen: litros de producto / 100 litros de caldo</option><option value="mass">Masa: kg de producto / 100 litros de caldo</option></select></label>}
 <details className="calc-extra"><summary>Añadir un máximo por hectárea indicado en una nota</summary><label className="calc-label">Límite adicional de producto ({unit==='l'||unit==='ml'?'l':'kg'}/ha)<input aria-label="Límite adicional de producto por hectárea" inputMode="decimal" value={extraMax} onChange={e=>setExtraMax(e.target.value)} placeholder="Solo si la ficha establece otro máximo"/></label><p>Transcribe el máximo de la nota aplicable a este uso. No sustituye la comprobación de las demás condiciones.</p></details>
 <div className={'calc-result '+(danger?'calc-danger':incomplete||pending?'calc-review':'calc-ok')} role="status" aria-live="polite"><strong>{title}</strong>
 {!result.ready?<p>{result.reason}</p>:<><div className="calc-values"><span>Producto aplicado<strong>{number(result.perHa)} {result.unit}/ha</strong></span><span>Mezcla preparada<strong>{number(result.per1000)} {result.unit}/1.000 l</strong></span></div>
 {!result.checkable?<p>{result.reason}</p>:<><p>Para este volumen de caldo, el intervalo oficial equivale a <strong>{number(result.limitPer1000.min)}–{number(result.limitPer1000.max)} {result.unit} por 1.000 litros</strong>.</p><p>Dosis: {result.doseStatus==='above'?'supera el máximo':result.doseStatus==='below'?'inferior al mínimo':'dentro del intervalo'} · Caldo: {result.waterStatus==='unknown'?'requiere revisar la ficha':result.waterStatus==='within'?'dentro del intervalo':result.waterStatus==='above'?'supera el máximo':'inferior al mínimo'}.</p>
 {result.manualMax!==null&&<p>Máximo adicional introducido: {number(result.manualMax)} {result.unit}/ha · {result.extraStatus==='above'?'SUPERADO':'no superado'}.</p>}
 {result.reviewDose&&<p>La ficha contiene referencias adicionales a la dosis. Revisa sus notas; el cálculo automático compara el intervalo numérico y el máximo adicional que introduzcas.</p>}
 {result.percent&&<p>Porcentaje calculado según la base que has seleccionado: {number(result.officialValue)} %. Confirma esa base en la etiqueta.</p>}</>}
 </>}
 </div><p className="calc-footnote">Producto/ha = producto por 1.000 l × caldo/ha ÷ 1.000. La comprobación se limita a la dosis y al caldo de este uso; no valida el resto de condiciones de autorización ni los límites por campaña.</p>
 </>;
}
export default function DoseCalculator({uses,generalConditions}:{uses:any[];generalConditions:string}){
 const[index,setIndex]=useState(0);
 if(!uses.length)return <section className="dose-calculator"><h3>Cálculo rápido de dosis</h3><p>No hay usos oficiales con los que comparar esta mezcla.</p></section>;
 return <section className="dose-calculator" aria-label="Cálculo rápido de dosis"><h3>Cálculo rápido de dosis</h3><label className="calc-label">Uso oficial que quieres comprobar<select aria-label="Uso oficial para calcular dosis" value={index} onChange={e=>setIndex(Number(e.target.value))}>{uses.map((u,i)=><option value={i} key={i}>{u.Cultivo} · {u.Agente} · {u.MetodoAplicacion||'Método no indicado'} · {i+1}</option>)}</select></label><DoseForm key={index} use={uses[index]} generalConditions={generalConditions}/></section>;
}
