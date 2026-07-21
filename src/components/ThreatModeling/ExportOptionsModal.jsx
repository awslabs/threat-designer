import React, { useState, useEffect } from "react";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";

/**
 * ExportOptionsModal - Modal for selecting sections and columns before export
 *
 * Allows users to customize which sections, columns, and threat likelihood levels
 * are included in the exported document (PDF, DOCX, Excel, or Markdown).
 *
 * @param {boolean} visible - Whether modal is visible
 * @param {function} onDismiss - Callback when modal is dismissed
 * @param {function} onExport - Callback when export is confirmed with selections
 * @param {string} format - Export format (pdf, docx, xls, md)
 */
// Default selections
const defaultSections = {
  architectureDiagram: true,
  assumptions: true,
  assets: true,
  dataFlow: true,
  trustBoundary: true,
  threatSource: true,
  threatCatalog: true,
};
const defaultColumns = {
  name: true,
  strideCategory: true,
  description: true,
  target: true,
  likelihood: true,
  impact: true,
  source: true,
  vector: true,
  prerequisites: true,
  mitigations: true,
  notes: true,
};
const defaultLikelihoodFilter = {
  High: true,
  Medium: true,
  Low: true,
};

export const ExportOptionsModal = ({ visible, onDismiss, onExport, format }) => {
  // Section selections
  const [sections, setSections] = useState(defaultSections);
  // Column selections (for Threat Catalog table)
  const [columns, setColumns] = useState(defaultColumns);
  // Likelihood filter selections
  const [likelihoodFilter, setLikelihoodFilter] = useState(defaultLikelihoodFilter);
  // Reset all selections to defaults whenever the modal opens
  useEffect(() => {
    if (visible) {
      setSections({ ...defaultSections });
      setColumns({ ...defaultColumns });
      setLikelihoodFilter({ ...defaultLikelihoodFilter });
    }
  }, [visible]);

  // Section labels (architecture diagram only for PDF/DOCX)
  const supportsImages = format === "pdf" || format === "docx";
  const sectionLabels = {
    ...(supportsImages ? { architectureDiagram: "Architecture Diagram" } : {}),
    assumptions: "Assumptions",
    assets: "Assets",
    dataFlow: "Data Flow",
    trustBoundary: "Trust Boundary",
    threatSource: "Threat Source",
    threatCatalog: "Threat Catalog",
  };

  // Visible section keys (for counting and select all/deselect all)
  const visibleSectionKeys = Object.keys(sectionLabels);

  // Column labels (mapped to canonical field names)
  const columnLabels = {
    name: "Threat Name",
    strideCategory: "STRIDE Category",
    description: "Description",
    target: "Target",
    likelihood: "Likelihood",
    impact: "Impact",
    source: "Source",
    vector: "Attack Vector",
    prerequisites: "Prerequisites",
    mitigations: "Mitigations",
    notes: "Notes",
  };

  // Toggle section
  const toggleSection = (key) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Toggle column
  const toggleColumn = (key) => {
    setColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Toggle likelihood filter
  const toggleLikelihood = (key) => {
    setLikelihoodFilter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Select/Deselect all sections (only visible ones)
  const selectAllSections = () => {
    setSections((prev) => {
      const newState = { ...prev };
      visibleSectionKeys.forEach((key) => {
        newState[key] = true;
      });
      return newState;
    });
  };

  const deselectAllSections = () => {
    setSections((prev) => {
      const newState = { ...prev };
      visibleSectionKeys.forEach((key) => {
        newState[key] = false;
      });
      return newState;
    });
  };

  // Select/Deselect all columns
  const selectAllColumns = () => {
    const newState = {};
    Object.keys(columns).forEach((key) => {
      newState[key] = true;
    });
    setColumns(newState);
  };

  const deselectAllColumns = () => {
    const newState = {};
    Object.keys(columns).forEach((key) => {
      newState[key] = false;
    });
    setColumns(newState);
  };

  // Handle export
  const handleExport = () => {
    onExport({ sections, columns, likelihoodFilter });
  };

  // Count selected items (only count visible sections)
  const selectedSectionsCount = visibleSectionKeys.filter((key) => sections[key]).length;
  const totalSectionsCount = visibleSectionKeys.length;
  const selectedColumnsCount = Object.values(columns).filter(Boolean).length;
  const selectedLikelihoodCount = Object.values(likelihoodFilter).filter(Boolean).length;

  // Format display name
  const formatNames = {
    pdf: "PDF",
    docx: "DOCX",
    xls: "Excel (XLSX)",
    md: "Markdown (.md)",
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={`Export Options — ${formatNames[format] || format?.toUpperCase()}`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExport} disabled={selectedSectionsCount === 0}>
              Export
            </Button>
          </SpaceBetween>
        </Box>
      }
      size="large"
    >
      <SpaceBetween size="l">
        {/* Sections Selection */}
        <Container
          header={
            <Header
              variant="h2"
              description={`${selectedSectionsCount} of ${totalSectionsCount} sections selected`}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={selectAllSections} variant="inline-link">
                    Select All
                  </Button>
                  <Button onClick={deselectAllSections} variant="inline-link">
                    Deselect All
                  </Button>
                </SpaceBetween>
              }
            >
              Select Sections
            </Header>
          }
        >
          <ColumnLayout columns={2} variant="text-grid">
            {Object.entries(sectionLabels).map(([key, label]) => (
              <Checkbox key={key} checked={sections[key]} onChange={() => toggleSection(key)}>
                {label}
              </Checkbox>
            ))}
          </ColumnLayout>
        </Container>

        {/* Column Selection (only if Threat Catalog is selected) */}
        {sections.threatCatalog && (
          <>
            <Container
              header={
                <Header
                  variant="h2"
                  description={`${selectedColumnsCount} of ${Object.keys(columns).length} columns selected`}
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button onClick={selectAllColumns} variant="inline-link">
                        Select All
                      </Button>
                      <Button onClick={deselectAllColumns} variant="inline-link">
                        Deselect All
                      </Button>
                    </SpaceBetween>
                  }
                >
                  Threat Catalog Columns
                </Header>
              }
            >
              <ColumnLayout columns={3} variant="text-grid">
                {Object.entries(columnLabels).map(([key, label]) => (
                  <Checkbox key={key} checked={columns[key]} onChange={() => toggleColumn(key)}>
                    {label}
                  </Checkbox>
                ))}
              </ColumnLayout>
            </Container>

            {/* Likelihood Filter */}
            <Container
              header={
                <Header
                  variant="h2"
                  description={`${selectedLikelihoodCount} of ${Object.keys(likelihoodFilter).length} levels selected`}
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button
                        onClick={() => {
                          const newState = {};
                          Object.keys(likelihoodFilter).forEach((k) => (newState[k] = true));
                          setLikelihoodFilter(newState);
                        }}
                        variant="inline-link"
                      >
                        Select All
                      </Button>
                      <Button
                        onClick={() => {
                          const newState = {};
                          Object.keys(likelihoodFilter).forEach((k) => (newState[k] = false));
                          setLikelihoodFilter(newState);
                        }}
                        variant="inline-link"
                      >
                        Deselect All
                      </Button>
                    </SpaceBetween>
                  }
                >
                  Filter by Likelihood
                </Header>
              }
            >
              <ColumnLayout columns={3} variant="text-grid">
                {Object.keys(likelihoodFilter).map((level) => (
                  <Checkbox
                    key={level}
                    checked={likelihoodFilter[level]}
                    onChange={() => toggleLikelihood(level)}
                  >
                    {level}
                  </Checkbox>
                ))}
              </ColumnLayout>
            </Container>
          </>
        )}

        {/* Warning if no sections selected */}
        {selectedSectionsCount === 0 && (
          <Box variant="p" color="text-status-error">
            Please select at least one section to export.
          </Box>
        )}
      </SpaceBetween>
    </Modal>
  );
};
