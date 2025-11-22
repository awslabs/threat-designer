import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Modal,
  Box,
  SpaceBetween,
  FormField,
  Input,
  Textarea,
  Select,
  Button,
  TokenGroup,
  Grid,
  ColumnLayout,
} from "@cloudscape-design/components";

/**
 * LeafEditModal - Modal for editing leaf node with all attributes
 */
const LeafEditModal = ({ visible, nodeData, onSave, onCancel }) => {
  // Form state
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [attackChainPhase, setAttackChainPhase] = useState(null);
  const [impactSeverity, setImpactSeverity] = useState(null);
  const [likelihood, setLikelihood] = useState(null);
  const [skillLevel, setSkillLevel] = useState(null);
  const [prerequisites, setPrerequisites] = useState([]);
  const [techniques, setTechniques] = useState([]);

  // Temporary input state for list fields
  const [newPrerequisite, setNewPrerequisite] = useState("");
  const [newTechnique, setNewTechnique] = useState("");

  const [isFormValid, setIsFormValid] = useState(false);

  // Dropdown options
  const attackChainPhaseOptions = [
    { label: "Reconnaissance", value: "Reconnaissance" },
    { label: "Resource Development", value: "Resource Development" },
    { label: "Initial Access", value: "Initial Access" },
    { label: "Execution", value: "Execution" },
    { label: "Persistence", value: "Persistence" },
    { label: "Privilege Escalation", value: "Privilege Escalation" },
    { label: "Defense Evasion", value: "Defense Evasion" },
    { label: "Credential Access", value: "Credential Access" },
    { label: "Discovery", value: "Discovery" },
    { label: "Lateral Movement", value: "Lateral Movement" },
    { label: "Collection", value: "Collection" },
    { label: "Command and Control", value: "Command and Control" },
    { label: "Exfiltration", value: "Exfiltration" },
    { label: "Impact", value: "Impact" },
  ];

  const severityOptions = [
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
    { label: "Critical", value: "critical" },
  ];

  const skillLevelOptions = [
    { label: "Novice", value: "novice" },
    { label: "Intermediate", value: "intermediate" },
    { label: "Expert", value: "expert" },
  ];

  // Initialize form data when modal opens or nodeData changes
  useEffect(() => {
    if (visible && nodeData) {
      // Handle both direct data and nested data structure
      const data = nodeData.data || nodeData;
      setLabel(data.label || nodeData.label || "");
      setDescription(data.description || "");

      // Set attack chain phase
      const selectedPhase = attackChainPhaseOptions.find(
        (opt) => opt.value === data.attackChainPhase
      );
      setAttackChainPhase(selectedPhase || null);

      // Set impact severity
      const selectedSeverity = severityOptions.find((opt) => opt.value === data.impactSeverity);
      setImpactSeverity(selectedSeverity || null);

      // Set likelihood
      const selectedLikelihood = severityOptions.find((opt) => opt.value === data.likelihood);
      setLikelihood(selectedLikelihood || null);

      // Set skill level
      const selectedSkillLevel = skillLevelOptions.find((opt) => opt.value === data.skillLevel);
      setSkillLevel(selectedSkillLevel || null);

      // Set arrays
      setPrerequisites(data.prerequisites || []);
      setTechniques(data.techniques || []);
    }
  }, [visible, nodeData]);

  // Validate form - only label and attack chain phase are required
  useEffect(() => {
    setIsFormValid(label.trim() !== "" && attackChainPhase !== null);
  }, [label, attackChainPhase]);

  // List management functions
  const handleAddPrerequisite = () => {
    if (newPrerequisite.trim()) {
      setPrerequisites([...prerequisites, newPrerequisite.trim()]);
      setNewPrerequisite("");
    }
  };

  const handleRemovePrerequisite = (indexToRemove) => {
    setPrerequisites(prerequisites.filter((_, i) => i !== indexToRemove));
  };

  const handleAddTechnique = () => {
    if (newTechnique.trim()) {
      setTechniques([...techniques, newTechnique.trim()]);
      setNewTechnique("");
    }
  };

  const handleRemoveTechnique = (indexToRemove) => {
    setTechniques(techniques.filter((_, i) => i !== indexToRemove));
  };

  const handleSave = () => {
    if (!isFormValid) return;

    const updatedData = {
      label: label.trim(),
      description: description.trim(),
      attackChainPhase: attackChainPhase.value,
      impactSeverity: impactSeverity?.value || "medium",
      likelihood: likelihood?.value || "medium",
      skillLevel: skillLevel?.value || "intermediate",
      prerequisites,
      techniques,
    };

    onSave(nodeData.id, updatedData);
    handleDismiss();
  };

  const handleDismiss = () => {
    // Reset form
    setLabel("");
    setDescription("");
    setAttackChainPhase(null);
    setImpactSeverity(null);
    setLikelihood(null);
    setSkillLevel(null);
    setPrerequisites([]);
    setTechniques([]);
    setNewPrerequisite("");
    setNewTechnique("");
    onCancel();
  };

  if (!nodeData) return null;

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header="Edit Leaf Attack Node"
      size="large"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={handleDismiss} variant="link">
              Cancel
            </Button>
            <Button onClick={handleSave} variant="primary" disabled={!isFormValid}>
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <ColumnLayout borders="vertical" columns={2}>
        {/* Left Column */}
        <SpaceBetween size="l">
          <FormField label="Attack Name" description="Short name for this attack">
            <Input
              value={label}
              onChange={({ detail }) => setLabel(detail.value)}
              placeholder="Enter attack name"
            />
          </FormField>

          <FormField label="Attack Description" description="Detailed description of the attack">
            <Textarea
              value={description}
              onChange={({ detail }) => setDescription(detail.value)}
              placeholder="Enter attack description"
              rows={3}
            />
          </FormField>

          <FormField label="Attack Chain Phase" description="MITRE ATT&CK framework phase">
            <Select
              selectedOption={attackChainPhase}
              onChange={({ detail }) => setAttackChainPhase(detail.selectedOption)}
              options={attackChainPhaseOptions}
              placeholder="Select attack phase"
            />
          </FormField>

          <FormField label="Impact Severity" description="Severity of the impact">
            <Select
              selectedOption={impactSeverity}
              onChange={({ detail }) => setImpactSeverity(detail.selectedOption)}
              options={severityOptions}
              placeholder="Select severity"
            />
          </FormField>

          <FormField label="Likelihood" description="Likelihood of success">
            <Select
              selectedOption={likelihood}
              onChange={({ detail }) => setLikelihood(detail.selectedOption)}
              options={severityOptions}
              placeholder="Select likelihood"
            />
          </FormField>

          <FormField label="Skill Level Required" description="Attacker skill level needed">
            <Select
              selectedOption={skillLevel}
              onChange={({ detail }) => setSkillLevel(detail.selectedOption)}
              options={skillLevelOptions}
              placeholder="Select skill level"
            />
          </FormField>
        </SpaceBetween>

        {/* Right Column */}
        <SpaceBetween size="l">
          <FormField label="Prerequisites" description="Required conditions for this attack">
            <SpaceBetween direction="vertical" size="xs">
              <Grid gridDefinition={[{ colspan: { default: 8 } }, { colspan: { default: 4 } }]}>
                <Input
                  value={newPrerequisite}
                  onChange={({ detail }) => setNewPrerequisite(detail.value)}
                  placeholder="Type new prerequisite"
                  onKeyDown={(e) => {
                    if (e.detail.key === "Enter") {
                      e.preventDefault();
                      handleAddPrerequisite();
                    }
                  }}
                />
                <Button onClick={handleAddPrerequisite} disabled={!newPrerequisite.trim()}>
                  Add
                </Button>
              </Grid>
              <TokenGroup
                items={prerequisites.map((item, index) => ({
                  label: item,
                  dismissLabel: `Remove ${item}`,
                }))}
                onDismiss={({ detail }) => handleRemovePrerequisite(detail.itemIndex)}
              />
            </SpaceBetween>
          </FormField>

          <FormField label="Attack Techniques" description="Specific techniques used">
            <SpaceBetween direction="vertical" size="xs">
              <Grid gridDefinition={[{ colspan: { default: 8 } }, { colspan: { default: 4 } }]}>
                <Input
                  value={newTechnique}
                  onChange={({ detail }) => setNewTechnique(detail.value)}
                  placeholder="Type new technique"
                  onKeyDown={(e) => {
                    if (e.detail.key === "Enter") {
                      e.preventDefault();
                      handleAddTechnique();
                    }
                  }}
                />
                <Button onClick={handleAddTechnique} disabled={!newTechnique.trim()}>
                  Add
                </Button>
              </Grid>
              <TokenGroup
                items={techniques.map((item, index) => ({
                  label: item,
                  dismissLabel: `Remove ${item}`,
                }))}
                onDismiss={({ detail }) => handleRemoveTechnique(detail.itemIndex)}
              />
            </SpaceBetween>
          </FormField>
        </SpaceBetween>
      </ColumnLayout>
    </Modal>
  );
};

LeafEditModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  nodeData: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string,
    data: PropTypes.shape({
      label: PropTypes.string,
      description: PropTypes.string,
      attackChainPhase: PropTypes.string,
      impactSeverity: PropTypes.string,
      likelihood: PropTypes.string,
      skillLevel: PropTypes.string,
      prerequisites: PropTypes.arrayOf(PropTypes.string),
      techniques: PropTypes.arrayOf(PropTypes.string),
      tools: PropTypes.arrayOf(PropTypes.string),
      timeRequired: PropTypes.string,
      cost: PropTypes.string,
      detectionProbability: PropTypes.number,
      cvssScore: PropTypes.number,
    }),
  }),
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default LeafEditModal;
