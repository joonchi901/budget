-- A dependent option may share its label with an option under another parent.
DROP INDEX tag_name_in_group;
CREATE UNIQUE INDEX tag_name_in_group ON tags(household_id,group_id,COALESCE(parent_id,''),name);
