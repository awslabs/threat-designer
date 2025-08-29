import { Table, Box, Header } from "@cloudscape-design/components";
import React from "react";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import { ModalComponent } from "./ModalForm";

export const ThreatTableComponent = React.memo(
  ({ headers, data, updateData, type, title = "Table", emptyMsg = "No data" }) => {
    const [openModal, setOpenModal] = React.useState(false);
    const [selectedIndex, setSelectedIndex] = React.useState(-1);
    const [selectedItems, setSelectedItems] = React.useState([]);
    const [action, setAction] = React.useState(null);
    const arrayToBullets = (value) => {
      if (Array.isArray(value)) {
        return value.map((item) => `• ${item}`).join("\n");
      }
      return value;
    };

    const handleModal = () => {
      setOpenModal(true);
    };

    const columnDefinitions = headers.map((header) => {
      const formattedHeader = header
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

      return {
        id: header.toLowerCase(),
        header: formattedHeader,
        cell: (item) => {
          const value = item[header.toLowerCase()];
          return <div>{arrayToBullets(value)}</div>;
        },
        sortingField: header.toLowerCase(),
      };
    });

    return (
      <>
        <Table
          columnDefinitions={columnDefinitions}
          onSelectionChange={({ detail }) => {
            setSelectedItems(detail.selectedItems);
            if (detail.selectedItems.length > 0) {
              const selectedItem = detail.selectedItems[0];
              const index = data.findIndex((item) => item === selectedItem);
              setSelectedIndex(index);
            } else {
              setSelectedIndex(-1);
            }
          }}
          items={data}
          selectedItems={selectedItems}
          wrapLines
          empty={
            <Box textAlign="center" color="inherit">
              <b>{emptyMsg}</b>
            </Box>
          }
          header={
            <Header
              actions={
                <ButtonDropdown
                  onItemClick={(itemClickDetails) => {
                    setAction(itemClickDetails.detail.id);
                    if (
                      itemClickDetails.detail.id === "edit" ||
                      itemClickDetails.detail.id === "add"
                    ) {
                      handleModal();
                    }
                    if (itemClickDetails.detail.id === "delete") {
                      updateData(type, selectedIndex, null);
                      setSelectedItems([]);
                    }
                  }}
                  items={[
                    { id: "add", text: "Add", disabled: false },
                    {
                      id: "edit",
                      text: "Edit",
                      disabled: selectedItems.length === 0,
                    },
                    {
                      id: "delete",
                      text: "Delete",
                      disabled: selectedItems.length === 0,
                    },
                  ]}
                  ariaLabel={`Edit ${title} Table`}
                  variant="icon"
                />
              }
            >
              {title}
            </Header>
          }
          sortingDisabled
          selectionType={"single"}
          variant="container"
        />
        <ModalComponent
          headers={headers}
          data={action === "edit" ? selectedItems[0] : []}
          visible={openModal}
          setVisible={setOpenModal}
          index={selectedIndex}
          updateData={updateData}
          action={action}
          type={type}
        />
      </>
    );
  }
);
