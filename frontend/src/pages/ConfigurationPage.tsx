import {lazy, Suspense, useMemo} from 'react'
import {Box, Stack, Tab, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useLocation, useNavigate} from '@tanstack/react-router'
import {configurationIndexRoute} from '@routes'
import {
    BankAccountDto,
    CompetitionCategoryDto,
    CompetitionSetupTemplateDto,
    CompetitionTemplateDto,
    ContactInformationDto,
    DocumentTemplateDto,
    EventDocumentTypeDto,
    FeeDto,
    GapDocumentTemplateDto,
    NamedParticipantDto,
    ParticipantRequirementDto,
    WorkTypeDto,
} from '@api/types.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useEntityAdministration} from '@utils/hooks.ts'
import {a11yProps} from '@utils/helpers.ts'
import {loadChunk} from '@utils/chunkReload.ts'
import {LoadingState, PageHeader} from '@components/ui'
import TabSelectionContainer from '@components/tab/TabSelectionContainer.tsx'
import InlineLink from '@components/InlineLink.tsx'
import DocumentTypeTable from '@components/event/document/type/DocumentTypeTable.tsx'
import DocumentTypeDialog from '@components/event/document/type/DocumentTypeDialog.tsx'
import ParticipantRequirementTable from '@components/event/participantRequirement/ParticipantRequirementTable.tsx'
import ParticipantRequirementDialog from '@components/event/participantRequirement/ParticipantRequirementDialog.tsx'
import CompetitionCategoryTable from '@components/event/competition/category/CompetitionCategoryTable.tsx'
import CompetitionCategoryDialog from '@components/event/competition/category/CompetitionCategoryDialog.tsx'
import NamedParticipantTable from '@components/event/competition/namedParticipant/NamedParticipantTable.tsx'
import NamedParticipantDialog from '@components/event/competition/namedParticipant/NamedParticipantDialog.tsx'
import FeeTable from '@components/event/competition/fee/FeeTable.tsx'
import FeeDialog from '@components/event/competition/fee/FeeDialog.tsx'
import CompetitionTemplateTable from '@components/event/competition/template/CompetitionTemplateTable.tsx'
import CompetitionTemplateDialog from '@components/event/competition/template/CompetitionTemplateDialog.tsx'
import DocumentTemplateTable from '@components/documentTemplate/DocumentTemplateTable.tsx'
import DocumentTemplateDialog from '@components/documentTemplate/DocumentTemplateDialog.tsx'
import GapDocumentTemplateTable from '@components/gapDocumentTemplate/GapDocumentTemplateTable.tsx'
import CompetitionSetupTemplateTable from '@components/event/competition/setup/template/CompetitionSetupTemplateTable.tsx'
import CompetitionSetupTemplateDialog from '@components/event/competition/setup/template/CompetitionSetupTemplateDialog.tsx'
import BankAccountTable from '@components/bankAccount/BankAccountTable.tsx'
import BankAccountDialog from '@components/bankAccount/BankAccountDialog.tsx'
import ContactInformationTable from '@components/contactInformation/ContactInformationTable.tsx'
import ContactInformationDialog from '@components/contactInformation/ContactInformationDialog.tsx'
import WorkTypeDialog from '@components/work/WorkTypeDialog.tsx'
import WorkTypeTable from '@components/work/WorkTypeTable.tsx'
import StartListConfigPanel from '@components/startListConfig/StartListConfigPanel.tsx'
import RatingCategoryPanel from '@components/ratingCategory/RatingCategoryPanel.tsx'
import MatchResultImportConfigPanel from '@components/matchResultImportConfig/MatchResultImportConfigPanel.tsx'
import PaceReferencePanel from '@components/paceReference/PaceReferencePanel.tsx'
import GlobalConfigurationsTab from '@components/configurations/GlobalConfigurationsTab.tsx'
import WebDavExportImport from '@components/configurations/WebDavExportImport.tsx'
import {
    CONFIGURATION_TAB_TEXT_KEYS,
    ConfigurationTab,
    resolveConfigurationTab,
    visibleConfigurationTabs,
} from './configurationPageLogic.ts'

export type {ConfigurationTab} from './configurationPageLogic.ts'

// Der Lückentext-Dialog bringt den PDF-Editor (pdf.js samt Worker) mit – das schwerste Stück der
// Seite. Er lädt erst, wenn der Reiter „Dokumente & Bedingungen" offen ist.
const GapDocumentTemplateDialog = lazy(() =>
    loadChunk(() => import('@components/gapDocumentTemplate/GapDocumentTemplateDialog.tsx')),
)

const ConfigurationPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()

    const {tab} = configurationIndexRoute.useSearch()
    const hash = useLocation({select: location => location.hash})

    const visible = useMemo(() => visibleConfigurationTabs(user.checkPrivilege), [user])
    const activeTab = resolveConfigurationTab(tab, hash, visible)

    // Ohne `hash` verwirft der Router den Anker; sonst hielte ein alter Anker den Reiter fest.
    const switchTab = (next: ConfigurationTab) => {
        navigate({to: '/config', search: {tab: next}}).then()
    }

    const tabProps = (value: ConfigurationTab) => a11yProps('configuration', value)

    const competitionTemplateAdministrationProps = useEntityAdministration<CompetitionTemplateDto>(
        t('event.competition.template.template'),
    )
    const competitionCategoryAdministrationProps = useEntityAdministration<CompetitionCategoryDto>(
        t('event.competition.category.category'),
    )
    const namedParticipantAdministrationProps = useEntityAdministration<NamedParticipantDto>(
        t('event.competition.namedParticipant.namedParticipant'),
    )
    const feeAdministrationProps = useEntityAdministration<FeeDto>(t('event.competition.fee.fee'))
    const documentTypeAdministrationProps = useEntityAdministration<EventDocumentTypeDto>(
        t('event.document.type.documentType'),
    )
    const participantRequirementAdministrationProps =
        useEntityAdministration<ParticipantRequirementDto>(
            t('participantRequirement.participantRequirement'),
        )
    const competitionSetupTemplateProps = useEntityAdministration<CompetitionSetupTemplateDto>(
        t('event.competition.setup.template.template'),
    )
    const documentTemplateAdministrationProps = useEntityAdministration<DocumentTemplateDto>(
        t('document.template.template'),
    )
    const gapDocumentTemplateAdministrationProps = useEntityAdministration<GapDocumentTemplateDto>(
        t('gap.document.template.template'),
    )
    const workTypeAdministrationProps = useEntityAdministration<WorkTypeDto>(t('work.type.type'))
    const bankAccountAdministrationProps = useEntityAdministration<BankAccountDto>(
        t('invoice.bank.account'),
    )
    const contactInformationAdministrationProps = useEntityAdministration<ContactInformationDto>(
        t('contact.information'),
    )

    const globalSettingsLink = (text: string) => (
        <InlineLink to={'/config'} search={{tab: 'global-settings'}}>
            {text}
        </InlineLink>
    )

    const panel = (() => {
        switch (activeTab) {
            case 'competition-templates':
                return (
                    <>
                        <CompetitionTemplateTable
                            {...competitionTemplateAdministrationProps.table}
                            title={t('event.competition.template.templates')}
                            hints={[t('event.competition.template.tableHint')]}
                        />
                        <CompetitionTemplateDialog
                            {...competitionTemplateAdministrationProps.dialog}
                        />
                        <CompetitionSetupTemplateTable
                            {...competitionSetupTemplateProps.table}
                            title={t('event.competition.setup.template.templates')}
                            hints={[t('event.competition.setup.tableHint')]}
                        />
                        <CompetitionSetupTemplateDialog {...competitionSetupTemplateProps.dialog} />
                    </>
                )
            case 'competition-elements':
                return (
                    <>
                        <CompetitionCategoryTable
                            {...competitionCategoryAdministrationProps.table}
                            title={t('event.competition.category.categories')}
                            hints={[t('event.competition.category.tableHint')]}
                        />
                        <CompetitionCategoryDialog
                            {...competitionCategoryAdministrationProps.dialog}
                        />
                        <RatingCategoryPanel />
                        <NamedParticipantTable
                            {...namedParticipantAdministrationProps.table}
                            title={t('event.competition.namedParticipant.namedParticipants')}
                            hints={[t('event.competition.namedParticipant.tableHint')]}
                        />
                        <NamedParticipantDialog {...namedParticipantAdministrationProps.dialog} />
                        <FeeTable
                            {...feeAdministrationProps.table}
                            title={t('event.competition.fee.fees')}
                            hints={[t('event.competition.fee.tableHint')]}
                        />
                        <FeeDialog {...feeAdministrationProps.dialog} />
                    </>
                )
            case 'lists-timing':
                return (
                    <>
                        <StartListConfigPanel />
                        <MatchResultImportConfigPanel />
                        <PaceReferencePanel />
                    </>
                )
            case 'event-elements':
                return (
                    <>
                        <DocumentTypeTable
                            {...documentTypeAdministrationProps.table}
                            title={t('event.document.type.documentTypes')}
                            hints={[t('event.document.type.tableHint')]}
                        />
                        <DocumentTypeDialog {...documentTypeAdministrationProps.dialog} />
                        <DocumentTemplateTable
                            {...documentTemplateAdministrationProps.table}
                            title={t('document.template.templates')}
                            hints={[
                                t('document.template.tableHint.1'),
                                <>
                                    {t('document.template.tableHint.2')}
                                    {globalSettingsLink(t('document.template.tableHint.3'))}
                                    {t('document.template.tableHint.4')}
                                </>,
                            ]}
                        />
                        <DocumentTemplateDialog {...documentTemplateAdministrationProps.dialog} />
                        <GapDocumentTemplateTable
                            {...gapDocumentTemplateAdministrationProps.table}
                            title={t('gap.document.template.templates')}
                            hints={[t('gap.document.template.tableHint')]}
                        />
                        <Suspense fallback={null}>
                            <GapDocumentTemplateDialog
                                {...gapDocumentTemplateAdministrationProps.dialog}
                            />
                        </Suspense>
                        <ParticipantRequirementTable
                            {...participantRequirementAdministrationProps.table}
                            title={t('participantRequirement.participantRequirements')}
                            hints={[t('participantRequirement.tableHint')]}
                        />
                        <ParticipantRequirementDialog
                            {...participantRequirementAdministrationProps.dialog}
                        />
                    </>
                )
            case 'organisation':
                return (
                    <>
                        <WorkTypeTable
                            {...workTypeAdministrationProps.table}
                            id={'worktypes'}
                            title={t('work.type.types')}
                            hints={[t('work.type.tableHint')]}
                        />
                        <WorkTypeDialog {...workTypeAdministrationProps.dialog} />
                        <ContactInformationTable
                            {...contactInformationAdministrationProps.table}
                            title={t('contact.contacts')}
                            hints={[
                                t('contact.tableHint.1'),
                                <>
                                    {t('contact.tableHint.2')}
                                    {globalSettingsLink(t('contact.tableHint.3'))}
                                    {t('contact.tableHint.4')}
                                </>,
                            ]}
                        />
                        <ContactInformationDialog
                            {...contactInformationAdministrationProps.dialog}
                        />
                        <BankAccountTable
                            {...bankAccountAdministrationProps.table}
                            title={t('invoice.bank.accounts')}
                            hints={[
                                t('invoice.bank.tableHint.1'),
                                <>
                                    {t('invoice.bank.tableHint.2')}
                                    {globalSettingsLink(t('invoice.bank.tableHint.3'))}
                                    {t('invoice.bank.tableHint.4')}
                                </>,
                            ]}
                        />
                        <BankAccountDialog {...bankAccountAdministrationProps.dialog} />
                    </>
                )
            case 'global-settings':
                return <GlobalConfigurationsTab />
            case 'export-data':
                return <WebDavExportImport />
        }
    })()

    return (
        <Box>
            <PageHeader title={t('configuration.configuration')} />
            <TabSelectionContainer activeTab={activeTab} setActiveTab={switchTab}>
                {visible.map(value => (
                    <Tab
                        key={value}
                        label={t(CONFIGURATION_TAB_TEXT_KEYS[value].label)}
                        sx={{cursor: 'pointer'}}
                        {...tabProps(value)}
                    />
                ))}
            </TabSelectionContainer>
            <Box
                role={'tabpanel'}
                id={`configuration-tabpanel-${activeTab}`}
                aria-labelledby={`configuration-tab-${activeTab}`}
                sx={{pt: 2}}>
                <Typography variant={'body2'} color={'text.secondary'} sx={{mb: 3}}>
                    {t(CONFIGURATION_TAB_TEXT_KEYS[activeTab].description)}
                </Typography>
                <Suspense fallback={<LoadingState />}>
                    <Stack spacing={4}>{panel}</Stack>
                </Suspense>
            </Box>
        </Box>
    )
}

export default ConfigurationPage
