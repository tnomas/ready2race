import {describe, expect, it} from 'vitest'
import {abbreviateFirstNames, collapseClubChain, crewCharBudget, fitCrewLine, fitCrewNames} from './streamText'

describe('abbreviateFirstNames', () => {
    it('kürzt jeden Vornamen auf die Initiale und lässt den Nachnamen stehen', () => {
        expect(abbreviateFirstNames(['Anna Petersen', 'Jonas Feddersen'])).toEqual(['A. Petersen', 'J. Feddersen'])
    })

    it('behält ein Präfix mit Punkt (Steuerleute) und kürzt nur die Vornamen dahinter', () => {
        expect(abbreviateFirstNames(['St. Kim Lorenzen'])).toEqual(['St. K. Lorenzen'])
    })

    it('kürzt mehrere Vornamen einzeln', () => {
        expect(abbreviateFirstNames(['Anna Maria Petersen'])).toEqual(['A. M. Petersen'])
    })

    it('lässt einen einzelnen Namen unverändert', () => {
        expect(abbreviateFirstNames(['Madonna'])).toEqual(['Madonna'])
    })
})

describe('fitCrewLine', () => {
    const crew = ['Anna Petersen', 'Lena Brodersen', 'Mia Sørensen', 'Ida Clausen', 'St. Kim Lorenzen']

    it('liefert die volle Punkt-Kette, solange sie ins Budget passt', () => {
        expect(fitCrewLine(crew, 200)).toBe('Anna Petersen · Lena Brodersen · Mia Sørensen · Ida Clausen · St. Kim Lorenzen')
    })

    it('fällt über dem Budget auf Initialen zurück, statt Namen abzuschneiden', () => {
        expect(fitCrewLine(crew, 60)).toBe('A. Petersen · L. Brodersen · M. Sørensen · I. Clausen · St. K. Lorenzen')
    })

    it('liefert null ohne Besatzung', () => {
        expect(fitCrewLine([], 60)).toBeNull()
    })

    it('gibt die Namen auch als Liste heraus, damit umbrechende Formen je Name eine Einheit setzen können', () => {
        expect(fitCrewNames(['Anna Petersen', 'Jonas Feddersen'], 200)).toEqual(['Anna Petersen', 'Jonas Feddersen'])
        expect(fitCrewNames(['Anna Petersen', 'Jonas Feddersen'], 10)).toEqual(['A. Petersen', 'J. Feddersen'])
    })
})

describe('collapseClubChain', () => {
    it('lässt Ketten bis zur erlaubten Gliederzahl stehen', () => {
        expect(collapseClubChain('Flensburger RC / RV Kappeln', 2)).toBe('Flensburger RC / RV Kappeln')
        expect(collapseClubChain('Kieler RV', 2)).toBe('Kieler RV')
    })

    it('zieht längere Ketten auf die ersten Glieder plus Rest zusammen', () => {
        expect(collapseClubChain('Eckernförder RC / Schleswiger RC / Flensburger RC', 2)).toBe(
            'Eckernförder RC / Schleswiger RC +1',
        )
        expect(collapseClubChain('A / B / C / D', 1)).toBe('A +3')
    })

    it('lässt einen angehängten Teamnamen (| …) am Ende stehen', () => {
        expect(collapseClubChain('A / B / C | Ratzeburg II', 2)).toBe('A / B +1 | Ratzeburg II')
    })

    it('gibt null/leer unverändert zurück', () => {
        expect(collapseClubChain(null, 2)).toBeNull()
        expect(collapseClubChain('', 2)).toBe('')
    })
})

describe('crewCharBudget', () => {
    it('gibt der zweizeiligen Zeile ein festes Budget, der einzeiligen den Rest neben dem Verein', () => {
        expect(crewCharBudget('stacked', 1, 'Kieler RV')).toBe(crewCharBudget('stacked', 1, 'Flensburger RC / RV Kappeln'))
        expect(crewCharBudget('line', 1, 'Kieler RV')).toBeGreaterThan(
            crewCharBudget('line', 1, 'Flensburger RC / RV Kappeln'),
        )
    })

    it('halbiert das Budget in der zweispaltigen Tafel', () => {
        expect(crewCharBudget('stacked', 2, 'Kieler RV')).toBeLessThan(crewCharBudget('stacked', 1, 'Kieler RV'))
        expect(crewCharBudget('line', 2, 'Kieler RV')).toBeLessThan(crewCharBudget('line', 1, 'Kieler RV'))
    })

    it('wird nie negativ, auch neben einer überlangen Vereinskette', () => {
        expect(crewCharBudget('line', 2, 'A'.repeat(200))).toBe(0)
    })
})
