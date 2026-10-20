import { Cpu, ShieldCheck } from 'lucide-react'
import type { Finding } from '../types/project'

/** How a finding was decided: the code's working, or an AI judgement a person must settle. */
export function ProofLine({ basis, proof }: Pick<Finding, 'basis' | 'proof'>) {
  if (basis === 'ai') {
    return (
      <p data-basis="ai" className="flex items-start gap-1.5 text-[13px] text-ai">
        <Cpu size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>AI judgement — a person decides</span>
      </p>
    )
  }
  return (
    <p data-basis="code" className="flex items-start gap-1.5 text-[13px]">
      <ShieldCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
      <span>
        <span className="font-medium text-ok">Checked by code</span>
        {proof && (
          <>
            <span className="text-ink-2">: </span>
            <span className="font-mono text-[12px]">{proof}</span>
          </>
        )}
      </span>
    </p>
  )
}
