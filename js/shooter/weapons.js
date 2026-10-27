// Оружие шутера. style: real — «настоящее» мультяшное, blaster — бластеры, toy — игрушечное.
// slot: 1 основное, 2 пистолет, 3 нож, 4 граната
export const WEAPONS = {
  knife:   { name: 'Нож', slot: 3, style: 'real', price: 0, melee: true, sound: 'knife', dmg: 55, rate: 0.5, range: 2.2, icon: 'kill' },
  pistol:  { name: 'Пистолет', slot: 2, style: 'real', model: 'bl/blaster-a', price: 0, dmg: 26, head: 2, rate: 0.22, mag: 12, reserve: 48, reload: 1.3, spread: 0.012, moveSpread: 0.03, range: 70, sound: 'hit', tracer: '#ffe08a', icon: 'pistol' },
  laser:   { name: 'Лазерный пистолет', slot: 2, style: 'blaster', model: 'bl/blaster-i', price: 500, dmg: 22, head: 1.8, rate: 0.16, mag: 20, reserve: 60, reload: 1.4, spread: 0.008, moveSpread: 0.02, range: 80, sound: 'laser', tracer: '#3df5ff', beam: true, icon: 'power' },
  water:   { name: 'Водяной пистолет', slot: 2, style: 'toy', model: 'bl/blaster-m', price: 300, dmg: 7, head: 1.2, rate: 0.07, auto: true, mag: 60, reserve: 120, reload: 1.6, spread: 0.05, moveSpread: 0.06, range: 16, sound: 'slime', tracer: '#5ab8ff', slow: 1.6, icon: 'water' },
  smg:     { name: 'Пистолет-пулемёт', slot: 1, style: 'real', model: 'bl/blaster-k', price: 1200, dmg: 17, head: 1.8, rate: 0.075, auto: true, mag: 30, reserve: 90, reload: 1.8, spread: 0.028, moveSpread: 0.035, range: 50, sound: 'hit', tracer: '#ffe08a', icon: 'gun' },
  rifle:   { name: 'Автомат', slot: 1, style: 'real', model: 'bl/blaster-g', price: 2700, dmg: 27, head: 2.2, rate: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.2, spread: 0.014, moveSpread: 0.05, range: 90, sound: 'hit', tracer: '#ffe08a', icon: 'rifle' },
  shotgun: { name: 'Дробовик', slot: 1, style: 'real', model: 'bl/blaster-l', price: 1800, dmg: 13, pellets: 8, head: 1.5, rate: 0.85, mag: 6, reserve: 24, reload: 2.4, spread: 0.075, moveSpread: 0.02, range: 22, sound: 'explode', tracer: '#ffe08a', icon: 'gun' },
  sniper:  { name: 'Снайперка', slot: 1, style: 'real', model: 'bl/blaster-e', price: 4000, dmg: 90, head: 2, rate: 1.3, mag: 5, reserve: 15, reload: 2.8, spread: 0.07, scopeSpread: 0.001, moveSpread: 0.1, range: 150, zoom: 3.5, sound: 'laser2', tracer: '#ffffff', icon: 'rifle' },
  plasma:  { name: 'Плазмомёт', slot: 1, style: 'blaster', model: 'bl/blaster-b', price: 3000, proj: 'plasma', speed: 34, dmg: 46, splash: 2.4, rate: 0.5, mag: 10, reserve: 30, reload: 2.2, spread: 0.01, moveSpread: 0.02, sound: 'blaster', icon: 'mage' },
  railgun: { name: 'Рельсотрон', slot: 1, style: 'blaster', model: 'bl/blaster-f', price: 4500, dmg: 105, head: 1.6, pierce: true, rate: 1.5, mag: 4, reserve: 12, reload: 2.6, spread: 0.002, moveSpread: 0.03, range: 150, zoom: 2, sound: 'laser2', tracer: '#c06bff', beam: true, icon: 'power' },
  paint:   { name: 'Пейнтбол', slot: 1, style: 'toy', model: 'bl/blaster-j', price: 900, dmg: 22, head: 2, rate: 0.17, auto: true, mag: 25, reserve: 75, reload: 1.8, spread: 0.02, moveSpread: 0.03, range: 60, sound: 'pop', tracer: '#ff4dc4', mark: 6, icon: 'target' },
  snow:    { name: 'Снежкомёт', slot: 1, style: 'toy', model: 'bl/blaster-h', price: 1400, proj: 'snow', speed: 30, grav: 14, dmg: 34, splash: 1.4, freeze: 1.1, knock: 9, rate: 0.55, mag: 8, reserve: 24, reload: 2, spread: 0.01, moveSpread: 0.02, sound: 'thud', icon: 'water' },
  bubble:  { name: 'Пупырчатая пушка', slot: 1, style: 'toy', model: 'bl/blaster-c', price: 1100, proj: 'bubble', speed: 15, grav: -1.5, dmg: 30, splash: 1.8, rate: 0.28, auto: true, mag: 20, reserve: 60, reload: 1.8, spread: 0.03, moveSpread: 0.03, sound: 'bubble', icon: 'bubble', desc: 'Стреляет пузырями — лопаются и толкают' },
  grenade: { name: 'Граната', slot: 4, style: 'real', model: 'bl/grenade-a', price: 300, throw: true, dmg: 95, splash: 4.5, fuse: 2.2, max: 2, rate: 0.8, icon: 'bomb' }
};
// гранаты: в слоте 4 лежит один вид (купил другой — старые заменятся)
WEAPONS.smoke = { name: 'Дымовая', slot: 4, style: 'real', model: 'bl/grenade-b', price: 300, throw: true, nade: true, dmg: 0, splash: 4.5, fuse: 1.6, max: 2, rate: 0.8, icon: 'smoke', desc: 'Облако дыма: сквозь него не видно' };
WEAPONS.flash = { name: 'Ослепляющая', slot: 4, style: 'real', model: 'bl/grenade-b', price: 300, throw: true, nade: true, dmg: 0, splash: 16, fuse: 1.4, max: 2, rate: 0.8, icon: 'flash', desc: 'Яркая вспышка: кто смотрит — ничего не видит' };
WEAPONS.sticky = { name: 'Липкая с краской', slot: 4, style: 'toy', model: 'bl/grenade-b', price: 400, throw: true, nade: true, dmg: 45, splash: 2.8, fuse: 1.8, max: 2, rate: 0.8, icon: 'brush', mark: 8, slow: 2, desc: 'Прилипает и брызгает краской' };
WEAPONS.banana = { name: 'Банановая граната', slot: 4, style: 'toy', model: 'bl/grenade-b', price: 500, throw: true, nade: true, dmg: 40, splash: 2.8, fuse: 2, max: 1, rate: 0.8, icon: 'banana', desc: 'Разлетается на маленькие бананы' };
WEAPONS.bananaS = { name: 'Бананчик', slot: 0, style: 'toy', dmg: 30, splash: 2.2, fuse: 0.8, icon: 'banana' };
WEAPONS.grenade.nade = true; WEAPONS.grenade.desc = 'Взрыв по площади';
export const NADES = ['grenade', 'smoke', 'flash', 'sticky', 'banana'];
export const GEAR = {
  armor: { name: 'Броня', price: 650, icon: 'shield', desc: 'Поглощает половину урона' },
  medkit: { name: 'Аптечка', price: 400, icon: 'heart', desc: 'Лечит 60 здоровья (клавиша H)' }
};
export const BUY_GROUPS = [
  { name: 'Пистолеты', items: ['pistol', 'laser', 'water'] },
  { name: 'Основное', items: ['smg', 'shotgun', 'paint', 'bubble', 'snow', 'rifle', 'plasma', 'sniper', 'railgun'] },
  { name: 'Гранаты', items: ['grenade', 'smoke', 'flash', 'sticky', 'banana'] },
  { name: 'Снаряжение', items: ['armor', 'medkit'] }
];
export const STYLE_NAMES = { real: 'Обычное', blaster: 'Бластер', toy: 'Игрушечное' };
export const MONEY = { start: 800, startTimed: 2000, kill: 300, win: 1600, lose: 1000, max: 9000, monster: 120 };
