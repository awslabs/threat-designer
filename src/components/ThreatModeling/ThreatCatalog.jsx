import React from "react";
import { Container } from "@cloudscape-design/components";
import { SpaceBetween } from "@cloudscape-design/components";
import Popover from "@cloudscape-design/components/popover";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import { CategoryIcon, ImpactIcon, TargetIcon } from "./CustomButton.jsx";
import Badge from "@cloudscape-design/components/badge";
import Grid from "@cloudscape-design/components/grid";
import TokenGroup from "@cloudscape-design/components/token-group";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Box from "@cloudscape-design/components/box";
import { ModalComponent } from "./ModalForm.jsx";
import ToggleButton from "@cloudscape-design/components/toggle-button";

export const ThreatComponent = React.memo((props) => {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    setItems(props?.data?.mitigations?.map((str) => ({ label: str })));
  }, [props?.data?.mitigations]);

  const [openModal, setOpenModal] = React.useState(false);
  const [action, setAction] = React.useState(null);
  const handleModal = () => {
    setOpenModal(true);
  };

  return (
    <>
      <Container
        header={
          <Header
            actions={
              <ButtonDropdown
                onItemClick={(itemClickDetails) => {
                  setAction(itemClickDetails.detail.id);
                  if (itemClickDetails.detail.id === "edit") {
                    handleModal();
                  }
                  if (itemClickDetails.detail.id === "delete") {
                    props?.updateData(props?.type, props?.index, null);
                  }
                }}
                items={[
                  { id: "edit", text: "Edit", disabled: false },
                  { id: "delete", text: "Delete", disabled: false },
                ]}
                ariaLabel={`Edit ${props?.data?.name} Threat`}
                variant="icon"
              />
            }
          >
            <SpaceBetween direction="horizontal" size="m">
              <SpaceBetween direction="horizontal" size="xs">
                <div style={{ marginTop: "-3px" }}>
                  <ToggleButton
                    onChange={({ detail }) =>
                      props?.updateData(props?.type, props?.index, {
                        ...props?.data,
                        starred: detail.pressed,
                      })
                    }
                    pressed={props?.data?.starred}
                    ariaLabel="Favorite"
                    iconName="star"
                    pressedIconName="star-filled"
                    variant="icon"
                  />
                </div>
                <div>{props?.data?.name}</div>
                <Badge color={`severity-${props?.data?.likelihood.toLowerCase()}`}>
                  {props?.data?.likelihood}
                </Badge>
              </SpaceBetween>
              <SpaceBetween direction="horizontal" size="xxxs">
                <Popover
                  dismissButton={false}
                  position="top"
                  size="small"
                  triggerType="custom"
                  content={props?.data?.stride_category}
                >
                  <Button
                    variant="icon"
                    ariaLabel="Stride category"
                    fullWidth
                    iconSvg={CategoryIcon()}
                  ></Button>
                </Popover>
                <Popover
                  dismissButton={false}
                  position="top"
                  size="small"
                  triggerType="custom"
                  content={props?.data?.impact}
                >
                  <Button
                    variant="icon"
                    ariaLabel="Impact"
                    fullWidth
                    iconSvg={ImpactIcon()}
                  ></Button>
                </Popover>
                <Popover
                  dismissButton={false}
                  position="top"
                  size="small"
                  triggerType="custom"
                  content={props?.data?.target}
                >
                  <Button
                    variant="icon"
                    ariaLabel="Target"
                    fullWidth
                    iconSvg={TargetIcon()}
                  ></Button>
                </Popover>
              </SpaceBetween>
            </SpaceBetween>
          </Header>
        }
      >
        <Grid
          gridDefinition={[
            { colspan: { default: 12, xxs: 6 } },
            { colspan: { default: 12, xxs: 6 } },
            { colspan: { default: 12, xxs: 12 } },
          ]}
        >
          <div style={{ marginTop: 5 }}>{props?.data?.description}</div>
          <SpaceBetween>
            <Header variant="h3">Mitigations:</Header>
            <TokenGroup
              onDismiss={({ detail: { itemIndex } }) => {
                setItems([...items.slice(0, itemIndex), ...items.slice(itemIndex + 1)]);
              }}
              items={items}
              readOnly
            />
          </SpaceBetween>
          <ExpandableSection headerText="Details">
            <div>
              <Box variant="span">
                <SpaceBetween size="xs">
                  <div>
                    <strong>Likelihood:</strong> {props?.data?.likelihood}
                  </div>
                  <div>
                    <strong>Category:</strong> {props?.data?.stride_category}
                  </div>
                  <div>
                    <strong>Impact:</strong> {props?.data?.impact}
                  </div>
                  <div>
                    <strong>Target:</strong> {props?.data?.target}
                  </div>
                  <div>
                    <strong>Threat source:</strong> {props?.data?.source}
                  </div>
                  <div>
                    <strong>Attack vector:</strong> {props?.data?.vector}
                  </div>
                  <div>
                    <strong>Prerequisites:</strong>{" "}
                    {props?.data?.prerequisites?.join(", ") || "None"}
                  </div>
                </SpaceBetween>
              </Box>
            </div>
          </ExpandableSection>
        </Grid>
      </Container>
      <ModalComponent
        headers={props.headers}
        data={action === "edit" ? props?.data : []}
        visible={openModal}
        setVisible={setOpenModal}
        index={props?.index}
        updateData={props?.updateData}
        action={action}
        type={props?.type}
        hasColumn={true}
        columnConfig={{
          left: ["name", "description", "likelihood", "stride_category", "impact", "target"],
          right: ["source", "vector", "prerequisites", "mitigations"],
        }}
      />
    </>
  );
});
