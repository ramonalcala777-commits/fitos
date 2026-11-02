export function positiveNumber(value){
 const text=String(value??'').trim();
 if(!/^\d+(?:[.,]\d+)?$/.test(text))return null;
 const number=Number(text.replace(',','.'));
 return Number.isFinite(number)&&number>0?number:null;
}
export function doseUnit(raw,basis=''){
 const unit=String(raw||'').toLowerCase().replace(/[\s.]/g,'');
 if(unit==='%')return basis==='volume'?{kind:'volume',unit:'l',factor:1,per:'percent'}:basis==='mass'?{kind:'mass',unit:'kg',factor:1,per:'percent'}:null;
 const match=unit.match(/^(l|ml|kg|g)\/(ha|hl|m2)$/);
 if(!match)return null;
 return {kind:['l','ml'].includes(match[1])?'volume':'mass',unit:['l','ml'].includes(match[1])?'l':'kg',factor:['ml','g'].includes(match[1])?.001:1,per:match[2]};
}
const compare=(value,min,max)=>value>max+1e-10?'above':value<min-1e-10?'below':'within';
function spanishNumber(text){return Number(text.replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));}
export function waterRange(use){
 const text=String(use['Volumen Caldo']||'').trim();
 // Only an unqualified, single range can be checked without choosing a season/user/method.
 const match=text.match(/^(\d+(?:[.,]\d+)*)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)*))?\s*l\s*\/\s*ha\.?$/i);
 if(match){const min=spanishNumber(match[1]),max=spanishNumber(match[2]||match[1]);return min>0&&max>=min?{min,max}:null;}
 if(!text&&Number(use.Volumen_Min)>0&&Number(use.VolumenMax)>=Number(use.Volumen_Min)&&/^l\s*\/\s*ha\.?$/i.test(String(use['Unidades Volumen']||'').trim()))return {min:Number(use.Volumen_Min),max:Number(use.VolumenMax)};
 return null;
}
export function calculateDose(use,{amount,volume,inputUnit='l',percentBasis='',extraMax='',generalConditions=''}={}){
 const quantity=positiveNumber(amount),water=positiveNumber(volume);
 if(quantity===null||water===null)return {ready:false,reason:'Introduce cantidades positivas. Puedes usar coma o punto decimal.'};
 const input={l:{kind:'volume',factor:1},ml:{kind:'volume',factor:.001},kg:{kind:'mass',factor:1},g:{kind:'mass',factor:.001}}[inputUnit];
 if(!input)return {ready:false,reason:'Unidad de producto no reconocida.'};
 const per1000=quantity*input.factor,perHa=per1000*water/1000;
 if(!Number.isFinite(perHa))return {ready:false,reason:'Las cantidades introducidas son demasiado grandes.'};
 const spec=doseUnit(use['Unidad Medida dosis'],percentBasis);
 const baseUnit=input.kind==='volume'?'l':'kg';
 const common={ready:true,per1000,perHa,unit:baseUnit};
 if(/no procede|no aplica|no aplicable|lista para su uso/i.test(String(use['Volumen Caldo']||'')))return {...common,checkable:false,reason:'Este uso no indica preparación de un caldo de aplicación. Consulta su método específico; no se valida como mezcla por 1.000 litros.'};
 if(!spec)return {...common,checkable:false,reason:use['Unidad Medida dosis']==='%'?'Indica si el porcentaje de la etiqueta es en volumen o en masa.':'La unidad oficial requiere consultar la nota o un método de aplicación específico; no se puede validar como mezcla por 1.000 litros.'};
 if(input.kind!==spec.kind)return {...common,checkable:false,reason:'La unidad introducida no corresponde a la unidad oficial. No se convierte entre masa y volumen sin conocer la densidad.'};
 const min=Number(use.Dosis_Min),max=Number(use.Dosis_Max);
 if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<=0||max<min)return {...common,checkable:false,reason:'MAPA no facilita un intervalo numérico de dosis válido para este uso.'};
 const officialValue=spec.per==='ha'?perHa/spec.factor:spec.per==='m2'?perHa/(spec.factor*10000):per1000/(spec.factor*10);
 const limitPer1000=spec.per==='ha'?{min:min*spec.factor*1000/water,max:max*spec.factor*1000/water}:spec.per==='m2'?{min:min*spec.factor*10000*1000/water,max:max*spec.factor*10000*1000/water}:{min:min*spec.factor*10,max:max*spec.factor*10};
 const range=waterRange(use),waterStatus=range?compare(water,range.min,range.max):'unknown';
 const manual=String(extraMax).trim(),manualMax=manual?positiveNumber(manual):null;
 if(manual&&manualMax===null)return {...common,checkable:false,reason:'El límite adicional debe ser un número positivo en '+baseUnit+'/ha.'};
 const doseStatus=compare(officialValue,min,max),extraStatus=manualMax===null?'unknown':compare(perHa,0,manualMax);
 const text=String(use.CondicionamientoEspecifico||'')+' '+generalConditions;
 const reviewDose=/dosis|dosific|m[aá]xim[^.\n]{0,70}(?:l\/ha|kg\/ha|%)/i.test(text);
 return {...common,checkable:true,officialValue,doseStatus,waterStatus,waterRange:range,limitPer1000,extraStatus,manualMax,reviewDose,percent:spec.per==='percent',overLimit:doseStatus==='above'||extraStatus==='above',belowLimit:doseStatus==='below'};
}
