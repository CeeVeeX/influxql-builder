import { raw } from './utils'

export const Time = {
  /** now() - INTERVAL '1m' 形式 */
  nowMinus: (interval: string) => raw(`now() - INTERVAL '${interval}'`),
}
