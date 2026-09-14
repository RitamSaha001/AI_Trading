/**
 * LUMEN-ASTRA-FIN 1.0: EXPERT 3 - REGULATORY & FORENSIC LAW
 * Detects SEBI enforcement actions, tax raids, forensic flags, and USFDA warnings.
 */

import { ExpertContribution } from '../types';

export class RegulatoryForensicExpert {
  public static readonly name = 'RegulatoryForensicExpert';

  public static evaluate(headline: string, weight: number): { contribution: ExpertContribution; isCriticalEmergencyVeto: boolean } {
    const upper = headline.toUpperCase();
    let directionScore = 0;
    const insights: string[] = [];
    let isCriticalEmergencyVeto = false;

    // Critical regulatory shocks
    if (/SEBI\s+(?:BAN|ORDER|RAID|PENALTY|PROBE|NOTICE)|ED\s+RAID|CBI\s+PROBE|ACCOUNTING\s+FRAUD|FORENSIC\s+AUDIT/i.test(upper)) {
      directionScore = -1.0;
      isCriticalEmergencyVeto = true;
      insights.push('Severe regulatory enforcement or forensic accounting violation detected. Immediate capital exit mandatory.');
    } else if (/USFDA\s+(?:IMPORT\s+ALERT|WARNING\s+LETTER|OBSERVATIONS?|FORM\s+483)/i.test(upper)) {
      directionScore = -0.85;
      isCriticalEmergencyVeto = true;
      insights.push('USFDA compliance deficiency/warning letter impairs pharmaceutical export revenue.');
    } else if (/USFDA\s+(?:APPROVAL|CLEARS?|TENTATIVE\s+APPROVAL)/i.test(upper)) {
      directionScore = 0.85;
      insights.push('USFDA abbreviated new drug application (ANDA) clearance expands US generic revenue.');
    } else if (/AUDITOR\s+RESIGNS?|PROMOTER\s+PLEDGE/i.test(upper)) {
      directionScore = -0.75;
      insights.push('Corporate governance distress signal: auditor resignation or high promoter pledge.');
    }

    return {
      contribution: {
        expertName: this.name,
        weight,
        directionScore,
        keyInsights: insights,
        recommendedSizingMult: isCriticalEmergencyVeto ? 0.0 : 1.0,
      },
      isCriticalEmergencyVeto,
    };
  }
}
