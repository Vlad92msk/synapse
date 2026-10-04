import type { IStorage } from '../../core/storage/storage.interface'
import type { PreStartActionBuffer } from '../../reactive/effects/preStartActionBuffer'

/**
 * Контракт «запуска эффектов» между rxjs-free ядром (`createSynapse`) и rxjs-слоем
 * (`synapse-storage/reactive`).
 *
 * Ядро не импортирует `EffectsModule` (а значит и rxjs): раннер приносят сами эффекты.
 * Каждая функция-эффект, созданная rxjs-слоем (`this.effect(...)` в `Effects`, `createEffect`,
 * `combineEffects`), помечена ключом {@link EFFECTS_RUNNER} со ссылкой на функцию запуска.
 * Приложение без эффектов (и без rxjs) этот код никогда не задевает.
 */

/** @internal Ключ раннера на функции-эффекте. `Symbol.for` — общий для дублей пакета в бандле. */
export const EFFECTS_RUNNER = /*#__PURE__*/ Symbol.for('synapse-storage.effects.runner')

/** Функция-эффект в том виде, в каком её видит ядро (сигнатура — забота rxjs-слоя). */
export type EffectFunctionLike = (...args: any[]) => unknown

/**
 * Структурный контракт class-эффектов (`Effects` из `synapse-storage/reactive`) — без импорта
 * их типов, чтобы `.d.ts` ядра не тянул rxjs.
 */
export interface EffectsLike {
  getEffects(): ReadonlyArray<EffectFunctionLike>
  onDestroy?(): void | Promise<void>
}

/** @internal Контекст запуска, который ядро передаёт раннеру. */
export interface EffectsRunnerContext {
  storage: IStorage<any>
  dispatcher: unknown
  externalDispatchers: Record<string, unknown>
  preStartBuffer?: PreStartActionBuffer
}

/** @internal Запущенные эффекты. */
export interface RunningEffects {
  start(): Promise<unknown>
  stop(): void
}

/** @internal */
export type EffectsRunner = (effects: EffectFunctionLike[], ctx: EffectsRunnerContext) => RunningEffects

/** @internal Раннер, которым помечена функция-эффект (или `undefined` для «голой» функции). */
export function getEffectsRunner(effect: EffectFunctionLike): EffectsRunner | undefined {
  return (effect as { [EFFECTS_RUNNER]?: EffectsRunner })[EFFECTS_RUNNER]
}

/** Похоже ли значение на инстанс class-эффектов. */
export function isEffectsLike(value: unknown): value is EffectsLike {
  return !!value && typeof value === 'object' && typeof (value as EffectsLike).getEffects === 'function'
}
